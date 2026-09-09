"""Original bounded local-EVM scenarios. Real-token fork and synthetic runs are separate.

No wallet or keys. Transactions go only to the owned loopback test node.
Anvil and support-script hashes must be separately retained and supplied.
"""
import argparse,hashlib,importlib.util,json,re,sys
from pathlib import Path
from datetime import datetime,timezone

HERE=Path(__file__).resolve().parent;APP=HERE.parents[1]
TOKEN='0xf3b9569f82b18aef890de263b84189bd33ebe452'
A='0x0000000000000000000000000000000000000001'
B='0x0000000000000000000000000000000000000002'
D='0x00000000000000000000000000000000ca180001'
MAX=(1<<256)-1;BLOCK='0x18bc1ea'
BLOCK_HASH='0xf3e3dfad2242562dbed62de90831c39eace7c7c6e88f8c509afccef9a5f73e4d'
ROOT='0x6d530d69c70f41b4b1a57f39751336304ff7c2c5d45e4dcd946869ecce4c0152'
TOKEN_SHA='ac5c77c1372337655d8f0257e34feec1ab0506dc8e8e7f034252cba66390bea1'
PINS={'../custody/CawCustodyProbe.sol':'a9015124d51c80d16cdedce9d97e456bc902d39d23a29d6e0528053340f4c0ee',
      '../custody/probe-build.json':'c939cea1d6bb8e75a3dc1f4809bb3b7fdd7358ed2c244f67e480148690e6d06a',
      'AdversarialToken.sol':'816e94532981acc84c817f89e661a7bb3e77a8637f9eab794159c0e406dc9935',
      'compile-standard.json':'7ab35e4dd89eac240905a2a409f12ae615bad96c735c597bc3cbf11bca9ab411',
      'fixture-build.json':'7e902c32c0bf5027bf84abb738d23808aae3e08f301b0fa26ef7b6bf7d77b38d',
      '../../reference/fixtures/generate-ethereum-proof-fixtures.py':'5f100b6e1a12d29b0004bcb29f2ba5b23ffefc076646d2b67b1fb8df81c2effa'}
def require(ok,label):
    if not ok:raise RuntimeError(label)
def sha(b):return hashlib.sha256(b).hexdigest()
def load_module(name,p,expected):
    b=p.read_bytes();require(len(b)<128*1024 and sha(b)==expected,'SOURCE_HASH')
    mod=importlib.util.module_from_spec(importlib.util.spec_from_loader(name,loader=None))
    mod.__file__=str(p);sys.modules[name]=mod
    exec(compile(b,str(p),'exec'),mod.__dict__);return mod
def word(v):
    if isinstance(v,str):
        require(re.fullmatch('0x[0-9a-f]{40}',v),'ABI_ADDRESS');v=int(v,16)
    require(type(v) in [int,bool] and 0<=v<=MAX,'ABI_RANGE');return f'{int(v):064x}'
def value(s):
    require(isinstance(s,str) and re.fullmatch('0x[0-9a-f]{64}',s),'ABI_UINT');return int(s,16)
def reason(text):
    raw=text.encode('ascii')
    return '0x08c379a0'+word(32)+word(len(raw))+raw.hex().ljust(((len(raw)+31)//32)*64,'0')
def assert_effect(before,after,deltas,label):
    require(set(before)==set(after) and set(deltas)<=set(before),'STATE_FIELDS:'+label)
    expected={key:str(int(amount)+deltas.get(key,0)) for key,amount in before.items()}
    require(after==expected,'STATE_EFFECT:'+label)
def revert_bytes(response):
    data=response['error'].get('data','0x')
    if isinstance(data,dict):data=data.get('data',data.get('return','0x'))
    require(isinstance(data,str) and re.fullmatch('0x(?:[0-9a-f]{2})*',data),'REVERT_BYTES');return data

class Scenarios:
    def __init__(self,node,oracle,probe,fixture,record):
        self.n=node;self.k=oracle;self.pb=probe;self.fb=fixture;self.r=record;self.probe=None
    def data(self,sig,*args):return '0x'+self.k.digest(sig.encode())[:4].hex()+''.join(word(x) for x in args)
    def read(self,label,to,sig,*args):return self.n.rpc(label,'eth_call',[{'from':D,'to':to,'data':self.data(sig,*args),'gas':'0xf4240','gasPrice':'0x174876e800','value':'0x0'},'latest'])
    def uint(self,label,to,sig,*args):return value(self.read(label,to,sig,*args))
    def rawtx(self,label,caller,to,data,success=True,error=None,returned='0x'):
        tx={'from':caller,'data':data,'gas':'0xf4240','gasPrice':'0x174876e800','value':'0x0'}
        if to is not None:tx['to']=to
        dry=self.n.rpc_raw(label+'.dry','eth_call',[tx,'latest'])
        require(('error' not in dry)==success,'DRY_STATUS:'+label)
        if success:require(dry.get('result')==(self.pb['runtime'] if to is None else returned),'DRY_RETURN:'+label)
        if not success and error is not None:require(revert_bytes(dry)==error,'REVERT:'+label)
        h=self.n.rpc(label+'.send','eth_sendTransaction',[tx])
        require(re.fullmatch('0x[0-9a-f]{64}',h),'TX_HASH')
        receipt=self.n.rpc(label+'.receipt','eth_getTransactionReceipt',[h])
        require(receipt is not None and receipt['transactionHash']==h,'TX_RECEIPT')
        require(receipt['status']==('0x1' if success else '0x0'),'TX_STATUS:'+label)
        require(int(receipt['gasUsed'],16)<=1000000,'GAS')
        if not success:require(receipt['logs']==[],'FAILED_LOGS')
        return {'dry_response':dry,'transaction_hash':h,'receipt':receipt}
    def tx(self,label,caller,to,sig,*args,success=True,error=None):
        returned='0x'+word(1) if sig in ['approve(address,uint256)','transfer(address,uint256)','transferFrom(address,address,uint256)'] else '0x'
        return self.rawtx(label,caller,to,self.data(sig,*args),success,error,returned)
    def state(self,label):
        fields=[('balance_a',TOKEN,'balanceOf(address)',[A]),('balance_b',TOKEN,'balanceOf(address)',[B]),
        ('balance_probe',TOKEN,'balanceOf(address)',[self.probe]),('supply',TOKEN,'totalSupply()',[]),
        ('allowance_a',TOKEN,'allowance(address,address)',[A,self.probe]),('allowance_b',TOKEN,'allowance(address,address)',[B,self.probe]),
        ('credit_a',self.probe,'credits(address)',[A]),('credit_b',self.probe,'credits(address)',[B]),('total_credits',self.probe,'totalCredits()',[])]
        return {name:str(self.uint(label+'.'+name,to,sig,*args)) for name,to,sig,args in fields}
    def event(self,label,caller,to,sig,*args,success=True,error=None,expected=None):
        before=self.state(label+'.before')
        result=self.tx(label,caller,to,sig,*args,success=success,error=error)
        after=self.state(label+'.after')
        effects=(expected or {}) if success else {}
        assert_effect(before,after,effects,label)
        self.r['cases'].append({'label':label,'kind':'transition','expected_success':success,'expected_deltas':effects,'expected_error':error,'before':before,'action':result,'after':after})
        return result
    def setup(self,mode):
        require(self.n.rpc('chain','eth_chainId',[])=='0x7a69','LOCAL_CHAIN')
        if mode=='fork':
            header=self.n.rpc('fork_header','eth_getBlockByNumber',[BLOCK,False]);require(header['hash']==BLOCK_HASH and header['stateRoot']==ROOT,'FORK_HEADER')
            code=self.n.rpc('token_runtime','eth_getCode',[TOKEN,'latest']);require(sha(bytes.fromhex(code[2:]))==TOKEN_SHA,'REAL_TOKEN_RUNTIME')
        else:
            require(self.n.rpc('empty_token','eth_getCode',[TOKEN,'latest'])=='0x','SYNTHETIC_FRESH')
            self.n.rpc('install_fixture','anvil_setCode',[TOKEN,self.fb['runtime']])
            require(self.n.rpc('fixture_runtime','eth_getCode',[TOKEN,'latest'])==self.fb['runtime'],'FIXTURE_RUNTIME')
        for who in [A,B,D]:
            self.n.rpc('gas_funding.'+who,'anvil_setBalance',[who,'0xde0b6b3a7640000'])
            self.n.rpc('impersonate.'+who,'anvil_impersonateAccount',[who])
        nonce=int(self.n.rpc('deployer_nonce','eth_getTransactionCount',[D,'latest']),16)
        require(nonce==0,'DISPOSABLE_NONCE')
        self.probe='0x'+self.k.digest(self.k.rlp([bytes.fromhex(D[2:]),b'']))[-20:].hex()
        require(self.n.rpc('probe_absent','eth_getCode',[self.probe,'latest'])=='0x','PROBE_FRESH')
        self.r['probe_address']=self.probe
        creation=self.rawtx('create_probe',D,None,self.pb['bytecode'])
        require(creation['receipt']['contractAddress'].lower()==self.probe,'CREATE_ADDRESS')
        require(self.n.rpc('probe_runtime','eth_getCode',[self.probe,'latest'])==self.pb['runtime'],'PROBE_RUNTIME')
        self.r['creation']=creation
        if mode=='synthetic':
            for who in [A,B]:
                self.tx('seed.'+who,D,TOKEN,'setBalance(address,uint256)',who,1000)
                self.tx('approve.'+who,who,TOKEN,'approve(address,uint256)',self.probe,100)
            self.tx('seed_deposit_a',A,self.probe,'deposit(uint256)',10)
            self.tx('seed_deposit_b',B,self.probe,'deposit(uint256)',7)
        self.r['initial']=self.state('initial')
        if mode=='synthetic':require(self.r['initial']=={'balance_a':'990','balance_b':'993','balance_probe':'17','supply':'2000','allowance_a':'90','allowance_b':'93','credit_a':'10','credit_b':'7','total_credits':'17'},'SYNTHETIC_INITIAL')
    def fork(self):
        initial=self.r['initial'];require(int(initial['balance_a'])==698790077736 and initial['balance_b']=='0','PINNED_BALANCES')
        require(initial['balance_probe']=='0' and initial['total_credits']=='0' and initial['allowance_a']=='0','INITIAL_CUSTODY')
        self.event('approve_13',A,TOKEN,'approve(address,uint256)',self.probe,13,expected={'allowance_a':13})
        for n in [1,7]:self.event('deposit_'+str(n),A,self.probe,'deposit(uint256)',n,expected={'balance_a':-n,'balance_probe':n,'allowance_a':-n,'credit_a':n,'total_credits':n})
        for label,caller,sig,n,err in [('foreign',B,'withdraw(uint256)',1,'InsufficientCredit()'),('deployer',D,'withdraw(uint256)',1,'InsufficientCredit()'),('zero_deposit',A,'deposit(uint256)',0,'ZeroAmount()'),('zero_withdraw',A,'withdraw(uint256)',0,'ZeroAmount()'),('overcredit',A,'withdraw(uint256)',9,'InsufficientCredit()')]:
            self.event(label,caller,self.probe,sig,n,success=False,error=self.data(err))
        self.event('overallowance',A,self.probe,'deposit(uint256)',6,success=False,error=reason('ERC20: transfer amount exceeds allowance'))
        for n in [3,5]:self.event('withdraw_'+str(n),A,self.probe,'withdraw(uint256)',n,expected={'balance_a':n,'balance_probe':-n,'credit_a':-n,'total_credits':-n})
        self.event('donation',A,TOKEN,'transfer(address,uint256)',self.probe,2,expected={'balance_a':-2,'balance_probe':2})
        self.event('surplus',A,self.probe,'withdraw(uint256)',1,success=False,error=self.data('InsufficientCredit()'))
        self.event('fund_b',A,TOKEN,'transfer(address,uint256)',B,4,expected={'balance_a':-4,'balance_b':4})
        self.event('approve_b',B,TOKEN,'approve(address,uint256)',self.probe,4,expected={'allowance_b':4})
        self.event('deposit_b',B,self.probe,'deposit(uint256)',4,expected={'balance_b':-4,'balance_probe':4,'allowance_b':-4,'credit_b':4,'total_credits':4})
        self.event('a_cannot_withdraw_b',A,self.probe,'withdraw(uint256)',1,success=False,error=self.data('InsufficientCredit()'))
        self.event('withdraw_b',B,self.probe,'withdraw(uint256)',4,expected={'balance_b':4,'balance_probe':-4,'credit_b':-4,'total_credits':-4})
        self.event('maximum_approve',A,TOKEN,'approve(address,uint256)',B,MAX)
        self.r['maximum_before']=str(self.uint('maximum_before',TOKEN,'allowance(address,address)',A,B))
        require(int(self.r['maximum_before'])==MAX,'MAX_APPROVAL')
        self.event('maximum_spend',B,TOKEN,'transferFrom(address,address,uint256)',A,B,1,expected={'balance_a':-1,'balance_b':1})
        self.r['maximum_after']=str(self.uint('maximum_after',TOKEN,'allowance(address,address)',A,B));require(int(self.r['maximum_after'])==MAX-1,'MAX_ALLOWANCE')
        self.event('zero_recipient',A,TOKEN,'transfer(address,uint256)','0x'+'00'*20,1,success=False,error=reason('ERC20: transfer to the zero address'))
        self.event('zero_transfer',A,TOKEN,'transfer(address,uint256)',B,0)
        self.event('insufficient_token_balance',A,TOKEN,'transfer(address,uint256)',B,int(initial['balance_a'])+1,success=False,error=reason('ERC20: transfer amount exceeds balance'))
        for case in self.r['cases']:require(case['after']['supply']==initial['supply'],'SUPPLY')
        self.r['final']=self.state('final')
    def synthetic(self):
        baseline=self.n.rpc('snapshot','evm_snapshot',[])
        def reset(label):
            nonlocal baseline
            require(self.n.rpc(label+'.reset','evm_revert',[baseline]),'SNAPSHOT_REVERT')
            baseline=self.n.rpc(label+'.snapshot','evm_snapshot',[])
            require(self.state(label+'.reset_state')==self.r['initial'],'RESET_STATE:'+label)
        def normal_recovery(label):
            before=self.r['cases'][-1]['after']
            self.tx(label+'.honest',D,TOKEN,'setMode(uint8,uint8)',0,0)
            self.tx(label+'.recovery_withdraw',A,self.probe,'withdraw(uint256)',1)
            self.tx(label+'.recovery_deposit',A,self.probe,'deposit(uint256)',1)
            after=self.state(label+'.recovered')
            assert_effect(before,after,{'allowance_a':-1},label+'.recovery')
            return after
        def movement(direction,fee=0):
            if direction=='deposit':return {'balance_a':-2-fee,'balance_probe':2,'supply':-fee,'allowance_a':-2,'credit_a':2,'total_credits':2}
            return {'balance_a':2,'balance_probe':-2,'credit_a':-2,'total_credits':-2}
        groups=[('false',1,False,'TokenRejected()'),('revert',2,False,'FixtureTransferReverted()'),('short',3,False,None),('empty',4,False,None),('invalid_bool',5,False,None),('trailing',6,True,None)]
        for direction in ['deposit','withdraw']:
            for name,mode,success,err in groups:
                label=direction+'_'+name;reset(label)
                self.tx(label+'.mode',D,TOKEN,'setMode(uint8,uint8)',mode if direction=='deposit' else 0,mode if direction=='withdraw' else 0)
                self.event(label,A,self.probe,direction+'(uint256)',2,success=success,error=self.data(err) if err else None,expected=movement(direction) if success else None)
                self.r['cases'][-1]['recovered']=normal_recovery(label)
        for direction,mode,name in [('deposit',7,'incoming_short'),('withdraw',8,'extra_debit'),('withdraw',9,'short_credit'),('deposit',10,'sender_fee')]:
            label=direction+'_'+name;reset(label)
            self.tx(label+'.mode',D,TOKEN,'setMode(uint8,uint8)',mode if direction=='deposit' else 0,mode if direction=='withdraw' else 0)
            self.event(label,A,self.probe,direction+'(uint256)',2,success=mode==10,error=None if mode==10 else self.data('UnexpectedTokenDelta()'),expected=movement(direction,1) if mode==10 else None)
            self.r['cases'][-1]['recovered']=normal_recovery(label)
        for outer in ['deposit','withdraw']:
            for inner in ['deposit','withdraw']:
                for propagate in [False,True]:
                    label=outer+'_callback_'+inner+('_bubble' if propagate else '_catch');reset(label)
                    self.tx(label+'.configure',D,TOKEN,'configureCallback(address,bool,bool)',self.probe,inner=='withdraw',propagate)
                    self.tx(label+'.mode',D,TOKEN,'setMode(uint8,uint8)',11 if outer=='deposit' else 0,11 if outer=='withdraw' else 0)
                    self.event(label,A,self.probe,outer+'(uint256)',2,success=not propagate,error=self.data('Reentrant()') if propagate else None,expected=movement(outer) if not propagate else None)
                    telemetry={key:self.read(label+'.'+key,TOKEN,sig) for key,sig in [('attempts','callbackAttempts()'),('success','lastCallbackSuccess()'),('error','lastCallbackError()'),('length','lastCallbackReturnLength()')]}
                    if propagate:require(all(int(v,16)==0 for v in telemetry.values()),'CALLBACK_ROLLBACK')
                    else:require(value(telemetry['attempts'])==1 and value(telemetry['success'])==0 and value(telemetry['length'])==4 and telemetry['error']==self.data('Reentrant()')+'00'*28,'CALLBACK_REJECTION')
                    self.r['cases'][-1]['callback']=telemetry
                    self.r['cases'][-1]['recovered']=normal_recovery(label)
        for direction in ['deposit','withdraw']:
            label='underbacked_'+direction;reset(label)
            self.tx(label+'.loss',D,TOKEN,'setBalance(address,uint256)',self.probe,16)
            self.event(label,A,self.probe,direction+'(uint256)',2,success=False,error=self.data('Underbacked()'))
            self.tx(label+'.donate',A,TOKEN,'transfer(address,uint256)',self.probe,1)
            self.tx(label+'.recovery_withdraw',A,self.probe,'withdraw(uint256)',1)
            recovered=self.state(label+'.recovered')
            assert_effect(self.r['cases'][-1]['after'],recovered,{'credit_a':-1,'total_credits':-1},label+'.recovery')
            self.r['cases'][-1]['recovered']=recovered
        self.r['final']=self.state('final')

def main():
    p=argparse.ArgumentParser();p.add_argument('--mode',choices=['fork','synthetic'],required=True);p.add_argument('--anvil',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--expected-script-sha256',required=True);p.add_argument('--expected-node-sha256',required=True);args=p.parse_args()
    require(re.fullmatch('[0-9a-f]{64}',args.expected_script_sha256) and sha(Path(__file__).read_bytes())==args.expected_script_sha256,'HARNESS_HASH')
    require(re.fullmatch('[0-9a-f]{64}',args.expected_node_sha256),'NODE_HASH_FORMAT')
    require(all(re.fullmatch('0x[0-9a-f]{40}',address) for address in [TOKEN,A,B,D]),'FIXED_ADDRESS_FORMAT')
    require(not args.output.exists() and args.output.parent.is_dir() and not args.output.is_symlink(),'NEW_OUTPUT')
    for name,h in PINS.items():require(sha((HERE/name).read_bytes())==h,'INPUT_HASH:'+name)
    node_module=load_module('caw_local_node',HERE/'local_node.py',args.expected_node_sha256)
    oracle=load_module('caw_local_keccak',HERE/'../../reference/fixtures/generate-ethereum-proof-fixtures.py',PINS['../../reference/fixtures/generate-ethereum-proof-fixtures.py'])
    probe=json.loads((HERE/'../custody/probe-build.json').read_text());fixture=json.loads((HERE/'fixture-build.json').read_text())
    record={'schema':'caw-local-custody/1','mode':args.mode,'utc':datetime.now(timezone.utc).isoformat(),'complete':False,'inputs':{'harness_sha256':args.expected_script_sha256,'node_sha256':args.expected_node_sha256,'files':PINS},'cases':[],'public_transaction_broadcast':False,'real_wallet_used':False,'local_impersonation':False,'synthetic_token_substitution':False,'token_state_patched':False,'consensus_or_owner_authentication':False}
    node=None
    try:
        node=node_module.Node(args.anvil,args.mode,args.output.parent/(args.output.stem+'-work'))
        with node:
            scenario=Scenarios(node,oracle,probe,fixture,record);scenario.setup(args.mode)
            getattr(scenario,args.mode)()
        require(node.receipt()['stop_reason'] is None,'NODE_STOPPED')
        record['complete']=True
    except Exception as exc:
        record['failure_type']=type(exc).__name__
        record['failure']=str(exc) if isinstance(exc,RuntimeError) and re.fullmatch('[A-Za-z0-9_:./-]{1,160}',str(exc)) else 'EXECUTION_FAILED'
    finally:
        if node:
            record['node']=node.receipt();record['local_calls']=node.calls;record['upstream_calls']=node.remote_calls
            record['local_impersonation']=any(x['method']=='anvil_impersonateAccount' for x in node.overrides)
            record['synthetic_token_substitution']=any(x['method']=='anvil_setCode' for x in node.overrides)
            record['token_state_patched']=record['synthetic_token_substitution']
        b=(json.dumps(record,indent=2)+'\n').encode();require(len(b)<4*1024*1024,'RECORD_BOUND')
        with args.output.open('xb') as out:out.write(b)
    print(json.dumps({'mode':args.mode,'complete':record['complete'],'cases':len(record['cases']),'failure':record.get('failure'),'bytes':len(b)}))
    return 0 if record['complete'] else 1
if __name__=='__main__':sys.exit(main())
