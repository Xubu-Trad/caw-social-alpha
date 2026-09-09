"""Local-only signed CAW experiment. Public test scalars are never real wallets.

The funding address is impersonated on the local fork only. This cannot spend
its public-chain tokens. No raw/signing RPC or public transaction is available.
"""
import argparse,hashlib,importlib.util,json,re,sys,time
from pathlib import Path
from datetime import datetime,timezone
from cryptography.hazmat.primitives.asymmetric import ec,utils
from cryptography.hazmat.primitives import hashes
import cryptography
HERE=Path(__file__).resolve().parent
A='0x765d03fe39e2a0a48ac162a15b541c3cd1d63e76';B='0x47ecac8221f18970c48cf48aaa3cbe8167bbbe73'
D='0x00000000000000000000000000000000ca180001';FUND='0x000000000000000000000000000000000000dead'
TOKEN='0xf3b9569f82b18aef890de263b84189bd33ebe452';FEE=5000*10**18
TEST_KEYS={1:0x1337ca200001,2:0x1337ca200002}
ORDER=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141
POST='post((uint256,uint256,uint256,uint256,uint256,bytes32,bytes),bytes)'
TYPE='Post(uint256 accountId,uint256 epoch,uint256 nonce,uint256 validAfter,uint256 deadline,bytes32 distributionHash,bytes32 textHash,uint256 fee,bytes32 profile)'
PROFILE='CAW_PAID_ACTION_THREE_ID_POOL_LOCKED_STAKE_UTF8_SCALARS_V1'
def need(ok,label):
    if not ok:raise RuntimeError(label)
def sha(b):return hashlib.sha256(b).hexdigest()
def word(n):return int(n,16).to_bytes(32,'big') if isinstance(n,str) else int(n).to_bytes(32,'big')
def blob(b):return word(len(b))+b+bytes((-len(b))%32)
def load(name,path):
    m=importlib.util.module_from_spec(importlib.util.spec_from_loader(name,loader=None));m.__file__=str(path);sys.modules[name]=m;exec(compile(path.read_bytes(),str(path),'exec'),m.__dict__);return m
class Run:
    def __init__(self,node,k,build):self.n=node;self.k=k.digest;self.rlp=k.rlp;self.build=build;self.rows=[];self.intents=[];self.reg=None;self.probe=None;self.deployments=[]
    def data(self,sig,*args):return '0x'+(self.k(sig.encode())[:4]+b''.join(word(x) for x in args)).hex()
    def tx(self,caller,to,data):return {'from':caller,'data':data,'gas':'0x3d0900','gasPrice':'0x174876e800','value':'0x0',**({'to':to} if to else {})}
    def view(self,label,to,sig,*args):return self.n.rpc(label,'eth_call',[self.tx(D,to,self.data(sig,*args)),'latest'])
    def uint(self,label,to,sig,*args):
        s=self.view(label,to,sig,*args);need(bool(re.fullmatch('0x[0-9a-f]{64}',s)),'UINT');return int(s,16)
    def send(self,label,caller,to,data,success=True,error=None,returned='0x'):
        tx=self.tx(caller,to,data);dry=self.n.rpc_raw(label+'.dry','eth_call',[tx,'latest'])
        need(('result' in dry)==success,'DRY_STATUS:'+label)
        if success and returned is not None:need(dry['result']==returned,'DRY_RETURN:'+label)
        if not success and error:need(dry['error'].get('data')==self.data(error),'DRY_REVERT:'+label)
        h=self.n.rpc(label+'.send','eth_sendTransaction',[tx]);receipt=None
        for i in range(10):
            response=self.n.rpc_raw(label+'.receipt'+str(i),'eth_getTransactionReceipt',[h])
            if response.get('result') is not None:receipt=response['result'];break
            need('error' not in response or response['error'].get('code')==-32601,'RECEIPT_ERROR')
            time.sleep(.05)
        need(receipt and receipt['transactionHash']==h and receipt['status']==('0x1' if success else '0x0'),'RECEIPT_STATUS:'+label)
        need(int(receipt['gasUsed'],16)<=4000000 and (success or receipt['logs']==[]),'RECEIPT_EFFECTS')
        row={'label':label,'transaction':tx,'dry_response':dry,'receipt':receipt};self.rows.append(row);return row
    def call(self,label,caller,to,sig,*args,success=True,error=None):return self.send(label,caller,to,self.data(sig,*args),success,error,'0x'+word(1).hex() if to==TOKEN else '0x')
    def deploy(self,name,args=(),immutables=None):
        c=self.build['contracts'][name];runtime=bytearray.fromhex(c['runtime'][2:])
        for field,locations in c['immutables'].items():
            for loc in locations:runtime[loc['start']:loc['start']+32]=word(immutables[field])
        row=self.send('deploy_'+name,D,None,c['bytecode']+b''.join(word(x) for x in args).hex(),returned='0x'+runtime.hex())
        address=row['receipt']['contractAddress'];need(self.n.rpc('runtime_'+name,'eth_getCode',[address,'latest'])=='0x'+runtime.hex(),'RUNTIME')
        self.deployments.append({'name':name,'address':address,'runtime':'0x'+runtime.hex()});return address
    def state(self,label):
        s={'owners':[],'epochs':[],'credits':[],'stakes':[],'nonces':[]}
        for i in (1,2,3):
            raw=bytes.fromhex(self.view(label+'.auth'+str(i),self.reg,'authority(uint256)',i)[2:]);need(len(raw)==64,'AUTHORITY')
            s['owners'].append('0x'+raw[12:32].hex());s['epochs'].append(str(int.from_bytes(raw[32:],'big')))
            for field in ['credits','stakes','nonces']:s[field].append(str(self.uint(label+'.'+field+str(i),self.probe,field+'(uint256)',i)))
        for field in ['totalCredits','poolDust','messageCount']:s[field]=str(self.uint(label+'.'+field,self.probe,field+'()'))
        s['tokenBalance']=str(self.uint(label+'.balance',TOKEN,'balanceOf(address)',self.probe));return s
    def header(self,label):return self.n.rpc(label,'eth_getBlockByNumber',['latest',False])
    def intent(self,label,text,epoch=None,nonce=None,owner=1,account=1,**changes):
        now=int(self.header(label+'.time')['timestamp'],16)
        r={'accountId':account,'epoch':self.uint(label+'.epoch',self.reg,'epoch(uint256)',account) if epoch is None else epoch,
           'nonce':self.uint(label+'.nonce',self.probe,'nonces(uint256)',account) if nonce is None else nonce,
           'validAfter':now-1,'deadline':now+100000,'distributionHash':self.view(label+'.pool',self.probe,'distributionHash()'),'text':text}
        r.update({key:value for key,value in changes.items() if key in r})
        domain=self.k(self.k(b'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')+self.k(b'CAW Paid Action Experiment')+self.k(b'1')+word(changes.get('chainId',31337))+word(changes.get('contract',self.probe)))
        struct=self.k(self.k(TYPE.encode())+b''.join(word(r[f]) for f in ['accountId','epoch','nonce','validAfter','deadline','distributionHash'])+self.k(r['text'])+word(changes.get('fee',FEE))+self.k(changes.get('profile',PROFILE).encode()))
        digest=self.k(b'\x19\x01'+domain+struct)
        tup=b''.join(word(r[f]) for f in ['accountId','epoch','nonce','validAfter','deadline','distributionHash'])+word(224)+blob(r['text'])
        encoded='0x'+(self.k(b'postDigest((uint256,uint256,uint256,uint256,uint256,bytes32,bytes))')[:4]+word(32)+tup).hex()
        actual=self.n.rpc(label+'.contract_digest','eth_call',[self.tx(D,self.probe,encoded),'latest'])
        if not any(x in changes for x in ['chainId','contract','fee','profile']):need(actual=='0x'+digest.hex(),'DIGEST_MISMATCH')
        # Prehashed consumes the supplied 32-byte EIP-712 digest unchanged; it
        # does not SHA256-hash it again. OpenSSL supplies the signing nonce.
        key=ec.derive_private_key(TEST_KEYS[owner],ec.SECP256K1());der=key.sign(digest,ec.ECDSA(utils.Prehashed(hashes.SHA256())))
        rr,ss=utils.decode_dss_signature(der);ss=min(ss,ORDER-ss)
        public=key.public_key().public_numbers();address='0x'+self.k(word(public.x)+word(public.y))[-20:].hex()
        key.public_key().verify(utils.encode_dss_signature(rr,ss),digest,ec.ECDSA(utils.Prehashed(hashes.SHA256())))
        signature=None
        for v in [27,28]:
            recovered=self.n.rpc(label+'.recover'+str(v),'eth_call',[self.tx(D,'0x'+'00'*19+'01','0x'+(digest+word(v)+word(rr)+word(ss)).hex()),'latest'])
            if recovered=='0x'+word(address).hex():signature=word(rr)+word(ss)+bytes([v])
        need(signature is not None,'RECOVERY')
        self.intents.append({'label':label,'request':{k:('0x'+v.hex() if isinstance(v,bytes) else str(v)) for k,v in r.items()},'digest':'0x'+digest.hex(),'signer':address,'signature':'0x'+signature.hex()})
        return r,signature
    def encode(self,r,sig):
        tup=b''.join(word(r[f]) for f in ['accountId','epoch','nonce','validAfter','deadline','distributionHash'])+word(224)+blob(r['text'])
        return '0x'+(self.k(POST.encode())[:4]+word(64)+word(64+len(tup))+tup+blob(sig)).hex()
    def post(self,label,r,sig,caller=D,success=True,error=None):
        before=self.state(label+'.before');row=self.send(label,caller,self.probe,self.encode(r,sig),success,error);after=self.state(label+'.after')
        need(success or before==after,'ROLLBACK:'+label);row.update(before=before,after=after);return row
    def run(self):
        need(self.n.rpc('chain','eth_chainId',[])=='0x7a69','CHAIN')
        pinned=self.n.rpc('historical_header','eth_getBlockByNumber',['0x18bc1ea',False])
        need(pinned['hash']=='0xf3e3dfad2242562dbed62de90831c39eace7c7c6e88f8c509afccef9a5f73e4d' and pinned['stateRoot']=='0x6d530d69c70f41b4b1a57f39751336304ff7c2c5d45e4dcd946869ecce4c0152','FORK_HEADER')
        for actor in [A,B,D,FUND]:self.n.rpc('gas.'+actor,'anvil_setBalance',[actor,'0xde0b6b3a7640000']);self.n.rpc('actor.'+actor,'anvil_impersonateAccount',[actor])
        need(sha(bytes.fromhex(self.n.rpc('token_code','eth_getCode',[TOKEN,'latest'])[2:]))=='ac5c77c1372337655d8f0257e34feec1ab0506dc8e8e7f034252cba66390bea1','TOKEN_PIN')
        for actor in [A,B]:need(self.n.rpc('empty_signer.'+actor,'eth_getCode',[actor,'latest'])=='0x','TEST_SIGNER_HAS_CODE')
        funding=self.uint('funding_balance',TOKEN,'balanceOf(address)',FUND);need(funding>=FEE*100,'FUNDING_BALANCE')
        for actor,label in [(A,'a'),(B,'b')]:self.call('fund_'+label,FUND,TOKEN,'transfer(address,uint256)',actor,FEE*40)
        self.start=self.header('start_header');self.history_start=len(self.rows)
        self.reg=self.deploy('TestAccountRegistry',(A,B));regcode=self.deployments[-1]['runtime'];rh='0x'+self.k(bytes.fromhex(regcode[2:])).hex()
        self.probe=self.deploy('CawPaidActionProbe',(self.reg,rh),{'registry':self.reg,'registryCodeHash':rh})
        need(self.uint('fee',self.probe,'FEE()')==FEE,'FEE')
        for actor,label in [(A,'a'),(B,'b')]:self.call('approve_'+label,actor,TOKEN,'approve(address,uint256)',self.probe,FEE*40)
        for i,actor,amount in [(1,A,FEE*25),(2,A,10),(3,B,10)]:self.call('deposit_'+str(i),actor,self.probe,'deposit(uint256,uint256,uint256)',i,0,amount)
        # A payer need not stake. Other IDs lock real deposited CAW base units.
        r,s=self.intent('no_pool',b'No empty pool');self.post('no_pool',r,s,success=False,error='NoEligibleStake()')
        for i,actor,n in [(2,A,1),(3,B,2)]:self.call('stake_'+str(i),actor,self.probe,'stake(uint256,uint256,uint256)',i,0,n)
        rr,ss=self.intent('underfunded',b'Insufficient unlocked credit.',account=2);self.post('underfunded',rr,ss,success=False,error='InsufficientCredit()')
        self.call('locked_withdraw',B,self.probe,'withdraw(uint256,uint256,uint256)',3,0,9,success=False,error='InsufficientCredit()')
        r,s=self.intent('first',b'CAW. Proof travels with the words.');self.post('first_relayer',r,s)
        self.post('duplicate_other_relayer',r,s,caller=B,success=False,error='InvalidNonce()')
        self.call('payer_stakes',A,self.probe,'stake(uint256,uint256,uint256)',1,0,3)
        for label,change in [('wrong_chain',{'chainId':1}),('wrong_contract',{'contract':self.reg}),('wrong_fee',{'fee':FEE+1}),('wrong_profile',{'profile':PROFILE+'_changed'}),('wrong_owner',{'owner':2})]:
            rr,ss=self.intent(label,b'Exact consent.',**change);self.post(label,rr,ss,success=False,error='InvalidSignature()')
        r,s=self.intent('changed_text',b'Original bytes');r['text']=b'Changed bytes';self.post('changed_text',r,s,success=False,error='InvalidSignature()')
        r,s=self.intent('high_s',b'No malleable signature');s=s[:32]+word(ORDER-int.from_bytes(s[32:64],'big'))+bytes([55-s[64]]);self.post('high_s',r,s,success=False,error='InvalidSignature()')
        now=int(self.header('expired_time')['timestamp'],16)
        r,s=self.intent('expired',b'Expired',validAfter=now-100,deadline=now-1);self.post('expired',r,s,success=False,error='InvalidWindow()')
        r,s=self.intent('stale_pool',b'Only this distribution.');self.call('stake_change',B,self.probe,'stake(uint256,uint256,uint256)',3,0,1);self.post('stale_pool',r,s,success=False,error='DistributionChanged()')
        self.call('unstake_restore',B,self.probe,'unstake(uint256,uint256,uint256)',3,0,1)
        for label,text,ok in [('unicode_419',('\u00e9'*419).encode(),True),('unicode_420',('\U0001f600'*420).encode(),True),('unicode_421',b'a'*421,False),('overlong',b'\xc0\xaf',False),('surrogate',b'\xed\xa0\x80',False),('empty',b'',False),('composed','\u00e9'.encode(),True),('decomposed','e\u0301'.encode(),True)]:
            r,s=self.intent(label,text);self.post(label,r,s,caller=A,success=ok,error=None if ok else 'InvalidText()')
        r,s=self.intent('before_transfer',b'Old ownership cannot return.');self.call('away',A,self.reg,'transferFrom(address,address,uint256)',A,B,1)
        self.post('old_epoch_away',r,s,success=False,error='StaleEpoch()')
        rr,ss=self.intent('new_owner',b'Authority follows the account.',owner=2);self.post('new_owner',rr,ss)
        self.call('return',B,self.reg,'transferFrom(address,address,uint256)',B,A,1)
        self.post('old_epoch_return',r,s,success=False,error='StaleEpoch()')
        r,s=self.intent('after_return',b'Current owner. Current epoch.');self.post('after_return_direct',r,s,caller=A)
        self.call('payer_unstakes',A,self.probe,'unstake(uint256,uint256,uint256)',1,2,3)
        self.call('withdraw_without_stake',A,self.probe,'withdraw(uint256,uint256,uint256)',1,2,1)
        wallet=self.deploy('TestSignatureOwner',(A,),{'signer':A})
        self.call('contract_owner_transfer',A,self.reg,'transferFrom(address,address,uint256)',A,wallet,1)
        for mode,label,ok in [(1,'wallet_wrong_magic',False),(2,'wallet_revert',False),(3,'wallet_short',False),(0,'wallet_valid',True),(4,'wallet_trailing',True)]:
            self.call(label+'.mode',D,wallet,'configure(uint8)',mode)
            rr,ss=self.intent(label,b'Contract owner. Exact signed intent.');self.post(label,rr,ss,success=ok,error=None if ok else 'InvalidSignature()')
        self.final=self.state('final');self.end=self.header('end_header')
        relevant=self.rows[self.history_start:];byblock={int(row['receipt']['blockNumber'],16):row for row in relevant}
        need(len(byblock)==len(relevant),'ONE_TX_PER_BLOCK')
        blocks=[]
        for number in range(int(self.start['number'],16)+1,int(self.end['number'],16)+1):
            header=self.n.rpc('history_block_'+str(number),'eth_getBlockByNumber',[hex(number),False])
            row=byblock.get(number);need(row is not None and header['transactions']==[row['receipt']['transactionHash']],'HISTORY_COMPLETENESS')
            blocks.append({'header':header,'transactions':[{'transaction':{'to':None,**row['transaction']},'receipt':row['receipt']}]})
        proberuntime=next(x['runtime'] for x in self.deployments if x['name']=='CawPaidActionProbe')
        history={'schema':'caw-paid-history/1','chain_id':31337,'addresses':{'registry':self.reg,'probe':self.probe,'token':TOKEN},'registry_runtime':regcode,'probe_runtime':proberuntime,'start_block':self.start,'end_block':self.end,'blocks':blocks,'final':self.final}
        manifest={'chain_id':31337,'addresses':history['addresses'],'registry_runtime_sha256':sha(bytes.fromhex(regcode[2:])),'probe_runtime_sha256':sha(bytes.fromhex(history['probe_runtime'][2:])),'start_block_hash':self.start['hash'],'end_block_hash':self.end['hash']}
        return history,manifest
def main():
    p=argparse.ArgumentParser();p.add_argument('--anvil',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--expected-input-sha256',required=True);a=p.parse_args()
    raw=(HERE/'experiment-inputs.json').read_bytes();need(sha(raw)==a.expected_input_sha256,'INPUT_MANIFEST');pins=json.loads(raw)['files']
    for name,pin in pins.items():need(sha((HERE/name).read_bytes())==pin,'INPUT_PIN')
    need(not a.output.exists() and a.output.parent.is_dir(),'NEW_OUTPUT')
    node_module=load('caw_paid_node',HERE/'paid_node.py');k=load('caw_paid_keccak',HERE/'../../reference/fixtures/generate-ethereum-proof-fixtures.py');build=json.loads((HERE/'paid-build.json').read_text())
    record={'schema':'caw-paid-action/1','utc':datetime.now(timezone.utc).isoformat(),'complete':False,'inputs':pins,'cryptography_version':cryptography.__version__,'public_test_key_scalars':[hex(x) for x in TEST_KEYS.values()],'real_wallet_used':False,'public_transaction_broadcast':False,'funding_authority_is_impersonated':True,'registration_implemented':False}
    node=None;run=None
    try:
        node=node_module.Node(a.anvil,'fork',a.output.parent/(a.output.stem+'-work'))
        with node:
            run=Run(node,k,build);history,manifest=run.run();record.update(history=history,manifest=manifest)
        need(node.receipt()['stop_reason'] is None,'NODE_STOP');record['complete']=True
    except Exception as ex:
        record['failure']=str(ex) if isinstance(ex,RuntimeError) and re.fullmatch('[A-Za-z0-9_.:/-]{1,160}',str(ex)) else type(ex).__name__
    finally:
        if run:record.update(transactions=run.rows,intents=run.intents,deployments=run.deployments)
        if node:record.update(node=node.receipt(),local_calls=node.calls,upstream_calls=node.remote_calls)
        # Raw RPC trace is separate from the bounded archive readers consume.
        encoded=(json.dumps(record,indent=2)+'\n').encode();need(len(encoded)<8*1024*1024,'CAPTURE_BOUND')
        with a.output.open('xb') as stream:stream.write(encoded)
    print(json.dumps({'complete':record['complete'],'failure':record.get('failure'),'transactions':len(record.get('transactions',[])),'bytes':len(encoded)}));return 0 if record['complete'] else 1
if __name__=='__main__':sys.exit(main())
