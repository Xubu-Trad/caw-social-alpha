"""Explicit local-only account experiment. No keys, signing or remote writes."""
import argparse,hashlib,importlib.util,json,re,sys,time
from datetime import datetime,timezone
from pathlib import Path
HERE=Path(__file__).resolve().parent
A='0x0000000000000000000000000000000000000001';B='0x0000000000000000000000000000000000000002'
D='0x00000000000000000000000000000000ca180001';ZERO='0x'+'00'*20
TOKEN='0xf3b9569f82b18aef890de263b84189bd33ebe452'
BLOCK='0x18bc1ea';BLOCK_HASH='0xf3e3dfad2242562dbed62de90831c39eace7c7c6e88f8c509afccef9a5f73e4d'
ROOT='0x6d530d69c70f41b4b1a57f39751336304ff7c2c5d45e4dcd946869ecce4c0152'
TOKEN_SHA='ac5c77c1372337655d8f0257e34feec1ab0506dc8e8e7f034252cba66390bea1'
def require(ok,label):
    if not ok:raise RuntimeError(label)
def sha(b):return hashlib.sha256(b).hexdigest()
def load(name,path,pin):
    raw=path.read_bytes();require(len(raw)<128*1024 and sha(raw)==pin,'MODULE_PIN')
    m=importlib.util.module_from_spec(importlib.util.spec_from_loader(name,loader=None));m.__file__=str(path);sys.modules[name]=m
    exec(compile(raw,str(path),'exec'),m.__dict__);return m
def word(x):
    if isinstance(x,str):require(re.fullmatch('0x(?:[0-9a-f]{40}|[0-9a-f]{64})',x),'ABI_HEX');x=int(x,16)
    require(type(x) in [int,bool] and 0<=x<2**256,'ABI_UINT');return f'{int(x):064x}'
def reason(s):
    b=s.encode();return '0x08c379a0'+word(32)+word(len(b))+b.hex().ljust((len(b)+31)//32*64,'0')
class Experiment:
    def __init__(self,node,keccak,build,record):self.n=node;self.k=keccak;self.build=build;self.r=record;self.reg=None;self.probe=None;self.hook=None;self.current=None
    def data(self,sig,*args):return '0x'+self.k.digest(sig.encode())[:4].hex()+''.join(word(x) for x in args)
    def txdata(self,caller,to,data):return {'from':caller,'data':data,'gas':'0xf4240','gasPrice':'0x174876e800','value':'0x0',**({'to':to} if to else {})}
    def view(self,label,to,sig,*args):return self.n.rpc(label,'eth_call',[self.txdata(D,to,self.data(sig,*args)),'latest'])
    def uint(self,label,to,sig,*args):
        raw=self.view(label,to,sig,*args);require(re.fullmatch('0x[0-9a-f]{64}',raw),'VIEW_UINT');return str(int(raw,16))
    def action(self,label,caller,to,data,success=True,error=None,returned='0x',section='setup'):
        tx=self.txdata(caller,to,data);dry=self.n.rpc_raw(label+'.dry','eth_call',[tx,'latest'])
        require(('error' not in dry)==success,'DRY_STATUS:'+label)
        if success:require(dry.get('result')==returned,'DRY_RETURN:'+label)
        else:require(dry['error'].get('data','0x')==error,'REVERT:'+label)
        h=self.n.rpc(label+'.send','eth_sendTransaction',[tx]);receipt=None;attempts=0
        # Auto-mining can finish after send returns. Only poll this submitted
        # local hash; retain every response, including refused fork fallbacks.
        for attempt in range(10):
            suffix='.receipt' if attempt==0 else '.receipt_retry_'+str(attempt)
            response=self.n.rpc_raw(label+suffix,'eth_getTransactionReceipt',[h]);attempts+=1
            if response.get('result') is not None:receipt=response['result'];break
            require('error' not in response or response['error']=={'code':-32601,'message':'Read-only historical proxy refused method or parameters'},'RECEIPT_RPC:'+label)
            if attempt<9:time.sleep(0.05)
        require(receipt and receipt['transactionHash']==h and receipt['status']==('0x1' if success else '0x0'),'RECEIPT:'+label)
        require(int(receipt['gasUsed'],16)<=1000000 and (success or receipt['logs']==[]),'GAS_LOGS:'+label)
        row={'label':label,'transaction':tx,'dry_response':dry,'receipt':receipt,'receipt_attempts':attempts}
        self.r[section].append(row);return row
    def call(self,label,caller,to,sig,*args,success=True,error=None,section='setup'):
        returned='0x'+word(1) if to==TOKEN and sig in ['approve(address,uint256)','transfer(address,uint256)','transferFrom(address,address,uint256)'] else '0x'
        return self.action(label,caller,to,self.data(sig,*args),success,error,returned,section)
    def state(self,label):
        s={}
        for name,who in [('a',A),('b',B),('d',D),('hook',self.hook),('probe',self.probe)]:s['balance_'+name]=self.uint(label+'.balance_'+name,TOKEN,'balanceOf(address)',who)
        s['supply']=self.uint(label+'.supply',TOKEN,'totalSupply()')
        for name,who in [('a',A),('b',B)]:s['allowance_'+name]=self.uint(label+'.allowance_'+name,TOKEN,'allowance(address,address)',who,self.probe)
        for i in [1,2,3]:
            raw=self.view(label+'.authority_'+str(i),self.reg,'authority(uint256)',i);require(re.fullmatch('0x[0-9a-f]{128}',raw),'AUTHORITY_ABI')
            require(int(raw[2:66],16)<2**160,'AUTHORITY_ADDRESS');s['owner_'+str(i)]='0x'+raw[26:66];s['epoch_'+str(i)]=str(int(raw[66:],16))
            s['credit_'+str(i)]=self.uint(label+'.credit_'+str(i),self.probe,'credits(uint256)',i)
            raw=self.view(label+'.approved_'+str(i),self.reg,'getApproved(uint256)',i);require(re.fullmatch('0x0{24}[0-9a-f]{40}',raw),'APPROVAL_ABI');s['approved_'+str(i)]='0x'+raw[-40:]
        s['total_credits']=self.uint(label+'.total_credits',self.probe,'totalCredits()')
        s['operator_a_d']=self.uint(label+'.operator_a_d',self.reg,'isApprovedForAll(address,address)',A,D)
        for name,who in [('a',A),('b',B),('d',D),('hook',self.hook)]:s['nft_'+name]=self.uint(label+'.nft_'+name,self.reg,'balanceOf(address)',who)
        return s
    def step(self,label,caller,to,sig,*args,success=True,error=None,delta=None,assign=None,data=None):
        before=dict(self.current)
        row=self.call(label,caller,to,sig,*args,success=success,error=error,section='steps') if data is None else self.action(label,caller,to,data,success,error,section='steps')
        # These reviewed fixture controls change instrumentation only. Retain
        # their raw transactions, but do not label a derived state as observed.
        observed=sig not in ['configure(address,address,uint256,address,address,uint256,uint8)','configureCallback(address,bool,bool)','setMode(uint8,uint8)']
        after=self.state(label+'.after') if observed else dict(before);expected=dict(before)
        for key,value in (delta or {}).items():expected[key]=str(int(expected[key])+value)
        expected.update(assign or {})
        require(after==expected,'STATE:'+label)
        row.update(before=before,after=after,after_observed=observed);self.current=after
        return row
    def runtime(self,name,values=None):
        c=self.build['contracts'][name];b=bytearray.fromhex(c['runtime'][2:])
        require(set(c['immutables'])==set(values or {}),'IMMUTABLE_NAMES')
        for n,locations in c['immutables'].items():
            for loc in locations:
                require(loc['length']==32 and b[loc['start']:loc['start']+32]==bytes(32),'IMMUTABLE_TEMPLATE')
                b[loc['start']:loc['start']+32]=bytes.fromhex(word(values[n]))
        return '0x'+b.hex()
    def deploy(self,label,name,args=(),values=None):
        nonce=int(self.n.rpc(label+'.nonce','eth_getTransactionCount',[D,'latest']),16)
        n=nonce.to_bytes((nonce.bit_length()+7)//8,'big');address='0x'+self.k.digest(self.k.rlp([bytes.fromhex(D[2:]),n]))[-20:].hex()
        require(self.n.rpc(label+'.absent','eth_getCode',[address,'latest'])=='0x','DEPLOY_FRESH')
        runtime=self.runtime(name,values);data=self.build['contracts'][name]['bytecode']+''.join(word(x) for x in args)
        row=self.action(label,D,None,data,returned=runtime)
        require(row['receipt']['contractAddress']==address,'DEPLOY_ADDRESS')
        require(self.n.rpc(label+'.runtime','eth_getCode',[address,'latest'])==runtime,'DEPLOY_RUNTIME')
        self.r['deployments'].append({'name':name,'address':address,'constructor_args':list(args),'runtime':runtime,'label':label});return address
    def setup(self,mode):
        require(self.n.rpc('chain','eth_chainId',[])=='0x7a69','CHAIN')
        if mode=='fork':
            header=self.n.rpc('fork_header','eth_getBlockByNumber',[BLOCK,False]);require(header['hash']==BLOCK_HASH and header['stateRoot']==ROOT,'FORK_HEADER')
            code=self.n.rpc('token_runtime','eth_getCode',[TOKEN,'latest']);require(sha(bytes.fromhex(code[2:]))==TOKEN_SHA,'TOKEN_RUNTIME')
        else:
            require(self.n.rpc('empty_token','eth_getCode',[TOKEN,'latest'])=='0x','EMPTY_TOKEN')
            fixture=self.build['contracts']['AccountAdversarialToken']['runtime'];self.n.rpc('install_fixture','anvil_setCode',[TOKEN,fixture])
            require(self.n.rpc('token_runtime','eth_getCode',[TOKEN,'latest'])==fixture,'SYNTHETIC_RUNTIME')
        for who in [A,B,D]:
            self.n.rpc('gas.'+who,'anvil_setBalance',[who,'0xde0b6b3a7640000']);self.n.rpc('actor.'+who,'anvil_impersonateAccount',[who])
        require(self.n.rpc('initial_nonce','eth_getTransactionCount',[D,'latest'])=='0x0','DISPOSABLE_ACTOR')
        self.reg=self.deploy('create_registry','TestAccountRegistry',(A,B))
        self.r['registry_codehash']='0x'+self.k.digest(bytes.fromhex(self.runtime('TestAccountRegistry')[2:])).hex()
        self.probe=self.deploy('create_probe','CawAccountCustodyProbe',(self.reg,self.r['registry_codehash']),{'registry':self.reg,'registryCodeHash':self.r['registry_codehash']})
        self.hook=self.deploy('create_hook','AccountHookFixture')
        self.r['addresses']={'registry':self.reg,'probe':self.probe,'hook':self.hook}
        for label,arg1,arg2,err in [('wrong_registry',ZERO,self.r['registry_codehash'],'InvalidRegistry()'),('wrong_registry_hash',self.reg,'0x'+'01'*32,'RegistryCodeChanged()')]:
            data=self.build['contracts']['CawAccountCustodyProbe']['bytecode']+word(arg1)+word(arg2)
            self.action(label,D,None,data,success=False,error=self.data(err))
        for interface,expected in [('01ffc9a7',True),('80ac58cd',True),('ffffffff',False),('5b5e139f',False)]:
            data=self.data('supportsInterface(bytes4)')+interface.ljust(64,'0');result=self.n.rpc('interface.'+interface,'eth_call',[self.txdata(D,self.reg,data),'latest']);require(result=='0x'+word(expected),'INTERFACE')
        require(self.view('registry_binding',self.probe,'registry()')=='0x'+word(self.reg),'REGISTRY_BINDING')
        require(self.view('registry_hash_binding',self.probe,'registryCodeHash()')==self.r['registry_codehash'],'HASH_BINDING')
        if mode=='synthetic':
            for name,who in [('a',A),('b',B)]:
                self.call('seed_'+name,D,TOKEN,'setBalance(address,uint256)',who,1000)
                self.call('approve_'+name,who,TOKEN,'approve(address,uint256)',self.probe,100)
            self.call('seed_1',A,self.probe,'deposit(uint256,uint256,uint256)',1,0,10)
            self.call('seed_2',A,self.probe,'deposit(uint256,uint256,uint256)',2,0,7)
            self.call('seed_3',B,self.probe,'deposit(uint256,uint256,uint256)',3,0,5)
        self.current=self.state('initial');self.r['initial']=dict(self.current)
    def deposit(self,label,caller,i,epoch,n,success=True,error=None):
        name={A:'a',B:'b',D:'d'}[caller];delta={} if not success else {'balance_'+name:-n,'balance_probe':n,'allowance_'+name:-n,'credit_'+str(i):n,'total_credits':n}
        return self.step(label,caller,self.probe,'deposit(uint256,uint256,uint256)',i,epoch,n,success=success,error=self.data(error) if error and '(' in error else error,delta=delta)
    def withdraw(self,label,caller,i,epoch,n,success=True,error=None):
        name={A:'a',B:'b',D:'d'}[caller];delta={} if not success else {'balance_'+name:n,'balance_probe':-n,'credit_'+str(i):-n,'total_credits':-n}
        return self.step(label,caller,self.probe,'withdraw(uint256,uint256,uint256)',i,epoch,n,success=success,error=self.data(error) if error and '(' in error else error,delta=delta)
    def transfer(self,label,caller,old,new,i,success=True,error=None,safe=False,onward=None):
        names={A:'a',B:'b',D:'d',self.hook:'hook'};delta={};assign={}
        if success:
            final=onward or new
            delta={'epoch_'+str(i):2 if onward else 1}
            if old!=final:delta.update({'nft_'+names[old]:-1,'nft_'+names[final]:1})
            assign={'owner_'+str(i):final,'approved_'+str(i):ZERO}
        self.step(label,caller,self.reg,('safeTransferFrom' if safe else 'transferFrom')+'(address,address,uint256)',old,new,i,success=success,error=self.data(error) if error else None,delta=delta,assign=assign)
    def config(self,label,mode,i=1,epoch=0):self.step(label,D,self.hook,'configure(address,address,uint256,address,address,uint256,uint8)',self.reg,self.probe,i,A,B,epoch,mode)
    def fork(self):
        require(self.current['balance_a']=='698790077736' and self.current['total_credits']=='0','FORK_INITIAL')
        self.step('approve_a',A,TOKEN,'approve(address,uint256)',self.probe,20,assign={'allowance_a':'20'})
        self.deposit('deposit_1',A,1,0,10);self.deposit('deposit_2',A,2,0,6)
        for label,caller,i,epoch,n,err in [('foreign',B,1,0,1,'NotAccountOwner()'),('deployer',D,1,0,1,'NotAccountOwner()'),('stale',A,1,1,1,'StaleEpoch()'),('invalid_id',A,4,0,1,'UnknownAccount()'),('zero_withdraw',A,1,0,0,'ZeroAmount()'),('isolated_credit',A,2,0,7,'InsufficientCredit()')]:self.withdraw(label,caller,i,epoch,n,False,err)
        self.deposit('zero_deposit',A,1,0,0,False,'ZeroAmount()');self.deposit('allowance_failure',A,1,0,5,False,reason('ERC20: transfer amount exceeds allowance'))
        self.withdraw('withdraw_2',A,2,0,2)
        self.step('approve_nft',A,self.reg,'approve(address,uint256)',D,1,assign={'approved_1':D})
        self.withdraw('approved_not_spender',D,1,0,1,False,'NotAccountOwner()');self.deposit('approved_not_depositor',D,1,0,1,False,'NotAccountOwner()')
        self.transfer('unauthorized_transfer',B,A,B,1,False,'NotAuthorized()');self.transfer('wrong_from',D,B,A,1,False,'WrongFrom()');self.transfer('zero_recipient',D,A,ZERO,1,False,'InvalidRecipient()')
        self.transfer('approved_transfer',D,A,B,1)
        self.withdraw('old_owner',A,1,1,1,False,'NotAccountOwner()');self.withdraw('new_owner_stale',B,1,0,1,False,'StaleEpoch()');self.withdraw('new_owner_withdraw',B,1,1,3)
        self.step('approve_b',B,TOKEN,'approve(address,uint256)',self.probe,2,assign={'allowance_b':'2'});self.deposit('new_owner_deposit',B,1,1,2)
        self.transfer('return_to_a',B,B,A,1);self.withdraw('old_epoch_after_return',A,1,0,1,False,'StaleEpoch()');self.withdraw('current_epoch',A,1,2,4)
        self.transfer('self_transfer',A,A,A,1);self.withdraw('pre_self_epoch',A,1,2,1,False,'StaleEpoch()')
        self.step('operator_grant',A,self.reg,'setApprovalForAll(address,bool)',D,True,assign={'operator_a_d':'1'});self.withdraw('operator_not_spender',D,1,3,1,False,'NotAccountOwner()')
        self.transfer('operator_takes_ownership',D,A,D,1);self.withdraw('operator_now_owner',D,1,4,1);self.transfer('operator_returns_nft',D,D,A,1)
        self.step('operator_revoke',A,self.reg,'setApprovalForAll(address,bool)',D,False,assign={'operator_a_d':'0'});self.transfer('revoked_operator',D,A,B,1,False,'NotAuthorized()')
        self.config('receiver_reject_config',5,2,0);self.transfer('receiver_reject',A,A,self.hook,2,False,'UnsafeRecipient()',True)
        self.config('receiver_forward_config',6,2,0);self.transfer('receiver_forward',A,A,self.hook,2,safe=True,onward=B)
        self.withdraw('forwarded_owner_withdraw',B,2,2,2)
        self.config('receiver_accept_config',0,1,5);self.transfer('receiver_accept',A,A,self.hook,1,safe=True)
        self.withdraw('prior_owner_after_safe',A,1,6,1,False,'NotAccountOwner()')
        self.config('contract_owner_config',2,1,6)
        self.step('contract_owner_withdraw',D,self.hook,'withdraw(uint256)',1,delta={'balance_hook':1,'balance_probe':-1,'credit_1':-1,'total_credits':-1})
    def synthetic(self):
        snapshot=self.n.rpc('baseline','evm_snapshot',[]);baseline=dict(self.current)
        def reset(label):
            nonlocal snapshot
            require(self.n.rpc(label+'.revert','evm_revert',[snapshot]) is True,'RESET');snapshot=self.n.rpc(label+'.snapshot','evm_snapshot',[])
            self.current=self.state(label+'.state');require(self.current==baseline,'RESET_STATE');self.r['resets'].append({'label':label,'before_step':len(self.r['steps']),'state':dict(self.current)})
        for label,incoming,outgoing,operation,error in [('false_deposit',1,0,'deposit','TokenRejected()'),('false_withdraw',0,1,'withdraw','TokenRejected()'),('sender_fee',10,0,'deposit','UnexpectedTokenDelta()'),('short_intake',7,0,'deposit','UnexpectedTokenDelta()'),('extra_vault_debit',0,8,'withdraw','UnexpectedTokenDelta()'),('short_recipient',0,9,'withdraw','UnexpectedTokenDelta()')]:
            reset(label);self.step(label+'.mode',D,TOKEN,'setMode(uint8,uint8)',incoming,outgoing);getattr(self,operation)(label,A,1,0,2,False,error)
        for outer in ['deposit','withdraw']:
            for inner in [1,2]:
                for propagate in [False,True]:
                    label=f'reentrant_{outer}_{inner}_{int(propagate)}';reset(label);self.config(label+'.hook',inner)
                    self.step(label+'.callback',D,TOKEN,'configureCallback(address,bool,bool)',self.hook,False,propagate)
                    self.step(label+'.mode',D,TOKEN,'setMode(uint8,uint8)',11 if outer=='deposit' else 0,11 if outer=='withdraw' else 0)
                    getattr(self,outer)(label,A,1,0,2,not propagate,'Reentrant()' if propagate else None)
                    telemetry={name:self.uint(label+'.'+name,TOKEN,sig) for name,sig in [('attempts','callbackAttempts()'),('success','lastCallbackSuccess()'),('length','lastCallbackReturnLength()')]}
                    error=self.view(label+'.error',TOKEN,'lastCallbackError()');require(telemetry=={'attempts':'0' if propagate else '1','success':'0','length':'0' if propagate else '4'},'CALLBACK_TELEMETRY')
                    require(error==('0x'+'00'*32 if propagate else self.data('Reentrant()').ljust(66,'0')),'CALLBACK_ERROR');self.r['telemetry'].append({'label':label,**telemetry,'error':error})
        for outer in ['deposit','withdraw']:
            for mode in [3,4]:
                label=f'ownership_{outer}_{mode}';reset(label);self.config(label+'.hook',mode)
                self.step(label+'.nft_approval',A,self.reg,'approve(address,uint256)',self.hook,1,assign={'approved_1':self.hook})
                self.step(label+'.callback',D,TOKEN,'configureCallback(address,bool,bool)',self.hook,False,True)
                self.step(label+'.mode',D,TOKEN,'setMode(uint8,uint8)',11 if outer=='deposit' else 0,11 if outer=='withdraw' else 0)
                getattr(self,outer)(label,A,1,0,2,False,'AuthorityChanged()')
        for operation in ['deposit','withdraw']:
            label='underbacked_'+operation;reset(label)
            self.step(label+'.loss',D,TOKEN,'setBalance(address,uint256)',self.probe,21,delta={'balance_probe':-1,'supply':-1})
            getattr(self,operation)(label,A,1,0,2,False,'Underbacked()')
            self.step(label+'.replenish',A,TOKEN,'transfer(address,uint256)',self.probe,1,delta={'balance_a':-1,'balance_probe':1})
            self.withdraw(label+'.recovered',A,1,0,1)
def main():
    p=argparse.ArgumentParser();p.add_argument('--mode',choices=['fork','synthetic'],required=True);p.add_argument('--anvil',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--expected-script-sha256',required=True);p.add_argument('--expected-input-sha256',required=True);args=p.parse_args()
    require(sha(Path(__file__).read_bytes())==args.expected_script_sha256,'HARNESS_PIN');raw=(HERE/'experiment-inputs.json').read_bytes();require(sha(raw)==args.expected_input_sha256,'INPUT_PIN');pins=json.loads(raw)['files']
    for name,h in pins.items():require(sha((HERE/name).read_bytes())==h,'INPUT_CHANGED')
    require(not args.output.exists() and args.output.parent.is_dir(),'NEW_OUTPUT')
    node_module=load('caw_account_node',HERE/'account_node.py',pins['account_node.py']);kpath='../../reference/fixtures/generate-ethereum-proof-fixtures.py';k=load('caw_account_keccak',HERE/kpath,pins[kpath]);build=json.loads((HERE/'authority-build.json').read_text())
    record={'schema':'caw-account-authority/1','mode':args.mode,'utc':datetime.now(timezone.utc).isoformat(),'complete':False,'harness_sha256':args.expected_script_sha256,'input_manifest_sha256':args.expected_input_sha256,'inputs':pins,'setup':[],'steps':[],'deployments':[],'resets':[],'telemetry':[],'real_wallet_used':False,'public_transaction_broadcast':False,'registration_implemented':False,'signature_verification_implemented':False,'delegation_implemented':False}
    node=None
    try:
        node=node_module.Node(args.anvil,args.mode,args.output.parent/(args.output.stem+'-work'))
        with node:
            exp=Experiment(node,k,build,record);exp.setup(args.mode);getattr(exp,args.mode)();record['final']=dict(exp.current)
        require(node.receipt()['stop_reason'] is None,'NODE_STOP');record['complete']=True
    except Exception as exc:
        record['failure_type']=type(exc).__name__;record['failure']=str(exc) if isinstance(exc,RuntimeError) and re.fullmatch('[A-Za-z0-9_.:/-]{1,160}',str(exc)) else 'EXECUTION_FAILED'
    finally:
        if node:record.update(node=node.receipt(),local_calls=node.calls,upstream_calls=node.remote_calls)
        b=(json.dumps(record,indent=2)+'\n').encode();require(len(b)<4*1024*1024,'CAPTURE_BOUND')
        with args.output.open('xb') as out:out.write(b)
    print(json.dumps({'mode':args.mode,'complete':record['complete'],'steps':len(record['steps']),'failure':record.get('failure'),'bytes':len(b)}));return 0 if record['complete'] else 1
if __name__=='__main__':sys.exit(main())
