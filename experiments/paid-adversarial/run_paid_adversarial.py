"""Finite adversarial execution of the unchanged alpha.20 paid-action contract.

Explicit invocation only. A fresh empty local chain receives a synthetic token
runtime; no historical fork, real wallet, remote RPC or public transaction.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sys

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True


def need(condition, label):
    if not condition:
        raise RuntimeError(label)


def load(name, path):
    import importlib.util
    spec = importlib.util.spec_from_loader(name, loader=None)
    module = importlib.util.module_from_spec(spec)
    module.__file__ = str(path)
    sys.modules[name] = module
    exec(compile(path.read_bytes(), str(path), 'exec'), module.__dict__)
    return module


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--anvil', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--expected-input-sha256', required=True)
    args = parser.parse_args()
    raw = (HERE / 'experiment-inputs.json').read_bytes()
    need(sha(raw) == args.expected_input_sha256, 'INPUT_MANIFEST')
    pins = json.loads(raw)['files']
    for name, expected in pins.items():
        need(sha((HERE / name).read_bytes()) == expected, 'INPUT_PIN')
    need(args.output.parent.is_dir() and not args.output.exists(), 'NEW_OUTPUT')
    base = load('paid_regression_base', HERE / '../paid-action/run_paid_action.py')
    node_module = load('paid_regression_node', HERE / 'synthetic_node.py')
    keccak = load('paid_regression_keccak', HERE / '../../reference/fixtures/generate-ethereum-proof-fixtures.py')
    build = json.loads((HERE / '../paid-action/paid-build.json').read_bytes())
    previous = json.loads((HERE / '../account-authority/authority-build.json').read_bytes())
    build['contracts']['AccountHookFixture'] = previous['contracts']['AccountHookFixture']
    build['contracts'].update(json.loads((HERE / 'attack-build.json').read_bytes())['contracts'])
    A, B, D, TOKEN, FEE, word, blob = base.A, base.B, base.D, base.TOKEN, base.FEE, base.word, base.blob

    class Regression(base.Run):
        def __init__(self, node):
            super().__init__(node, keccak, build)
            self.cases = []
            self.gas_spent = {}

        def send(self, label, caller, to, data, success=True, error=None, returned='0x'):
            row = super().send(label,caller,to,data,success,error,returned)
            self.gas_spent[caller] = self.gas_spent.get(caller,0) + int(row['receipt']['gasUsed'],16)
            if self.gas_spent[caller] >= 2000000:
                # Keep enough fabricated native gas for the 4M-gas eth_call
                # upfront check. Every refill is recorded, <=1 ETH and local.
                self.n.rpc(label+'.gas_refill','anvil_setBalance',[caller,'0xde0b6b3a7640000'])
                self.gas_spent[caller] = 0
            return row

        def control(self, label, to, signature, *values, actor=D, boolean=False):
            return self.send(label, actor, to, self.data(signature, *values),
                             returned='0x' + word(1).hex() if boolean else '0x')

        def configure_bytes(self, label, target, signature, value):
            data = '0x' + (self.k(signature.encode())[:4] + word(32) + blob(value)).hex()
            return self.send(label, D, target, data)

        def snapshot(self, label, backed=True):
            data = self.data('read(address[7])', self.reg, self.probe, TOKEN, A, B, self.hook, self.wallet)
            raw = self.n.rpc(label, 'eth_call', [self.tx(D, self.observer, data), 'latest'])
            need(bool(re.fullmatch('0x[0-9a-f]{2560}', raw)), 'SNAPSHOT_ENCODING')
            values = [int(raw[i:i+64], 16) for i in range(2, len(raw), 64)]
            need(sum(values[i] for i in (2, 8, 14)) == values[18], 'CREDIT_SUM')
            need(all(values[i+1] <= values[i] for i in (2, 8, 14)), 'LOCKED_CREDIT')
            if backed:
                need(values[21] >= values[18] + values[19], 'BACKING')
            return values

        def check(self, label, caller, to, data, success=False, error=None,
                  effect='rollback', incoming=None, callback=False, backed=True):
            before = self.snapshot(label + '.before', backed)
            row = self.send(label, caller, to, data, success, error)
            after = self.snapshot(label + '.after', backed)
            expected = before.copy()
            if effect == 'post':
                eligible = before[9] + before[15]
                need(eligible > 0, 'EXPECTED_POOL')
                allocations = [FEE * before[9] // eligible, FEE * before[15] // eligible]
                dust = FEE - sum(allocations)
                expected[2] -= FEE
                expected[8] += allocations[0]; expected[14] += allocations[1]
                expected[18] -= dust; expected[19] += dust
                expected[4] += 1; expected[20] += 1
            elif effect == 'move':
                amount = 1
                sign = 1 if incoming else -1
                expected[2] += sign * amount; expected[18] += sign * amount
                expected[21] += sign * amount; expected[22] -= sign * amount
                if incoming:
                    expected[26] -= amount
                if callback:
                    expected[31] += 1; expected[32] = 0
                    expected[33] = int(self.data('Reentrant()'), 16); expected[34] = 4
            else:
                need(effect == 'rollback' and not success, 'EXPECTED_EFFECT')
            need(after == expected, 'STATE_TRANSITION:' + label)
            if success and effect == 'post':
                events = [x for x in row['receipt']['logs'] if x['address'] == self.probe]
                need(len(events) == 1 and events[0]['topics'][0] == '0x' + self.k(
                    b'Posted(uint256,uint256,address,uint256,uint256,bytes,uint256,bytes32,uint256,uint256,uint256,uint256)').hex(), 'SINGLE_POST_EVENT')
            case = {'label': label, 'expected_success': success, 'effect': effect,
                    'expected_error': error, 'transaction_hash': row['receipt']['transactionHash'],
                    'before': [str(x) for x in before], 'after': [str(x) for x in after],
                    'backing_intentionally_short': not backed,
                    'token_callback_caught': callback, 'pass': True}
            self.cases.append(case)
            return case

        def post_case(self, label, request, signature, **kwargs):
            return self.check(label, kwargs.pop('caller', D), self.probe,
                              self.encode(request, signature), **kwargs)

        def move_case(self, label, incoming, **kwargs):
            method = 'deposit' if incoming else 'withdraw'
            return self.check(label, A, self.probe, self.data(method+'(uint256,uint256,uint256)', 1, 0, 1), incoming=incoming, **kwargs)

        def run(self):
            need(self.n.rpc('fresh_chain', 'eth_chainId', []) == '0x7a69', 'CHAIN')
            self.n.install_token()
            for actor in (A, B, D):
                self.n.rpc('gas.'+actor, 'anvil_setBalance', [actor, '0xde0b6b3a7640000'])
                self.n.rpc('actor.'+actor, 'anvil_impersonateAccount', [actor])
            self.reg = self.deploy('TestAccountRegistry', (A, B))
            registry_hash = '0x' + self.k(bytes.fromhex(self.deployments[-1]['runtime'][2:])).hex()
            self.probe = self.deploy('CawPaidActionProbe', (self.reg, registry_hash),
                                    {'registry': self.reg, 'registryCodeHash': registry_hash})
            self.hook = self.deploy('AccountHookFixture')
            self.entry = self.deploy('PaidEntrypointHook', (self.probe,), {'probe': self.probe})
            self.wallet = self.deploy('PaidSignatureAttackOwner', (A, self.probe, self.reg),
                                     {'signer': A, 'probe': self.probe, 'registry': self.reg})
            self.observer = self.deploy('PaidStateSnapshot')
            for actor, label in ((A, 'a'), (B, 'b')):
                self.control('mint_'+label, TOKEN, 'setBalance(address,uint256)', actor, FEE*60)
                self.control('approve_'+label, TOKEN, 'approve(address,uint256)', self.probe, FEE*60, actor=actor, boolean=True)
            for account, actor, amount in ((1,A,FEE*30), (2,A,10), (3,B,10)):
                self.control('deposit_'+str(account), self.probe, 'deposit(uint256,uint256,uint256)', account,0,amount,actor=actor)
            for account, actor, amount in ((1,A,3),(2,A,1),(3,B,2)):
                self.control('stake_'+str(account), self.probe, 'stake(uint256,uint256,uint256)',account,0,amount,actor=actor)
            request, signature = self.intent('initial_post', b'Adversarial regression. Local evidence only.')
            self.post_case('initial_post',request,signature,success=True,effect='post')
            self.post_case('duplicate_other_submitter',request,signature,caller=B,error='InvalidNonce()')

            # Responses happen after tentative balance/allowance changes.
            for incoming, modes in ((True,[1,2,3,4,5,7,10,6]), (False,[1,2,3,4,5,8,9,6])):
                for mode in modes:
                    label = ('deposit' if incoming else 'withdraw')+'_token_mode_'+str(mode)
                    self.control(label+'.mode',TOKEN,'setMode(uint8,uint8)',mode if incoming else 0,0 if incoming else mode)
                    error = 'TokenRejected()' if mode==1 else 'FixtureTransferReverted()' if mode==2 else 'UnexpectedTokenDelta()' if mode in (7,8,9,10) else None
                    self.move_case(label,incoming,success=mode==6,error=error,effect='move' if mode==6 else 'rollback')
            self.control('restore_honest',TOKEN,'setMode(uint8,uint8)',0,0)
            request, signature = self.intent('nested_post', b'Nested intent must not settle.')
            self.configure_bytes('nested_payload',self.entry,'setPostCalldata(bytes)',bytes.fromhex(self.encode(request,signature)[2:]))
            for incoming in (True,False):
                for action in range(1,6):
                    for propagate in (False,True):
                        label = ('deposit' if incoming else 'withdraw')+'_nested_'+str(action)+('_propagate' if propagate else '_caught')
                        self.control(label+'.action',self.entry,'configure(uint8,uint256,uint256)',action,1,0)
                        self.control(label+'.callback',TOKEN,'configureCallback(address,bool,bool)',self.entry,False,propagate)
                        self.control(label+'.mode',TOKEN,'setMode(uint8,uint8)',11 if incoming else 0,0 if incoming else 11)
                        self.move_case(label,incoming,success=not propagate,error='Reentrant()' if propagate else None,
                                       effect='rollback' if propagate else 'move',callback=not propagate)
            self.control('restore_honest_2',TOKEN,'setMode(uint8,uint8)',0,0)
            self.control('approve_nft_hook',self.reg,'approve(address,uint256)',self.hook,1,actor=A)
            for incoming in (True,False):
                for mode in (3,4):
                    label=('deposit' if incoming else 'withdraw')+'_ownership_'+str(mode)
                    self.control(label+'.hook',self.hook,'configure(address,address,uint256,address,address,uint256,uint8)',self.reg,self.probe,1,A,B,0,mode)
                    self.control(label+'.callback',TOKEN,'configureCallback(address,bool,bool)',self.hook,False,True)
                    self.control(label+'.mode',TOKEN,'setMode(uint8,uint8)',11 if incoming else 0,0 if incoming else 11)
                    self.move_case(label,incoming,error='AuthorityChanged()')
            self.control('restore_honest_3',TOKEN,'setMode(uint8,uint8)',0,0)
            self.control('clear_nft_approval',self.reg,'approve(address,uint256)',0,1,actor=A)

            # Artificial deficit is a test control, not a property of CAW.
            solvent = self.snapshot('before_deficit')
            self.control('create_deficit',TOKEN,'setBalance(address,uint256)',self.probe,solvent[18]+solvent[19]-1)
            for method in ('deposit','withdraw','stake','unstake'):
                self.check('underbacked_'+method,A,self.probe,self.data(method+'(uint256,uint256,uint256)',1,0,1),error='Underbacked()',backed=False)
            request, signature = self.intent('underbacked_post',b'No unbacked settlement.')
            self.post_case('underbacked_post',request,signature,error='Underbacked()',backed=False)
            self.control('repair_deficit',TOKEN,'setBalance(address,uint256)',self.probe,solvent[21])
            self.move_case('withdraw_after_deficit',False,success=True,effect='move')

            # Old-authority rejection after a real test-registry transfer.
            request, signature = self.intent('before_wallet_transfer',b'Prior authority expires on transfer.')
            self.control('wallet_takes_nft',self.reg,'transferFrom(address,address,uint256)',A,self.wallet,1,actor=A)
            self.post_case('old_epoch_after_wallet_transfer',request,signature,error='StaleEpoch()')
            def wallet_mode(label, mode, action=1):
                self.control(label+'.mode',self.wallet,'configure(uint8,uint8,uint256,uint256,address)',mode,action,1,1,B)
            for mode in (1,2,3,5,0,4):
                label='wallet_mode_'+str(mode)
                wallet_mode(label,mode)
                request, signature = self.intent(label,b'Wallet validation boundary.')
                ok=mode in (0,4)
                self.post_case(label,request,signature,success=ok,error=None if ok else 'InvalidSignature()',effect='post' if ok else 'rollback')
            wallet_mode('wallet_length_policy',6)
            for length in (0,4096,4097):
                label='wallet_signature_bytes_'+str(length)
                request, _ = self.intent(label,b'Explicit synthetic signature-length policy.')
                self.post_case(label,request,bytes(length),success=length<=4096,error=None if length<=4096 else 'InvalidSignature()',effect='post' if length<=4096 else 'rollback')
            for mode in (7,8):
                for action in range(1,6):
                    label='wallet_nested_'+str(action)+('_caught' if mode==7 else '_propagate')
                    request, signature = self.intent(label,b'Read-only signature callback.')
                    if action==5:
                        self.configure_bytes(label+'.payload',self.wallet,'setPostCalldata(bytes)',bytes.fromhex(self.encode(request,signature)[2:]))
                    wallet_mode(label,mode,action)
                    self.post_case(label,request,signature,success=mode==7,error=None if mode==7 else 'InvalidSignature()',effect='post' if mode==7 else 'rollback')
            for mode in (9,10):
                label='wallet_registry_'+('caught' if mode==9 else 'propagate')
                wallet_mode(label,mode)
                request, signature = self.intent(label,b'Static verification cannot transfer ownership.')
                self.post_case(label,request,signature,success=mode==9,error=None if mode==9 else 'InvalidSignature()',effect='post' if mode==9 else 'rollback')
            self.control('wallet_release',self.wallet,'releaseAccount(uint256,address)',1,A)
            self.check('stale_epoch_direct_owner',A,self.probe,self.data('withdraw(uint256,uint256,uint256)',1,0,1),error='StaleEpoch()')
            self.control('current_owner_unstake',self.probe,'unstake(uint256,uint256,uint256)',1,2,3,actor=A)
            before = self.snapshot('final_withdraw.before')
            row = self.control('final_current_owner_withdraw',self.probe,'withdraw(uint256,uint256,uint256)',1,2,1,actor=A)
            after = self.snapshot('final_withdraw.after')
            expected=before.copy()
            for index, delta in ((2,-1),(18,-1),(21,-1),(22,1)):
                expected[index]+=delta
            need(after==expected,'FINAL_WITHDRAWAL')
            self.cases.append({'label':'final_current_owner_withdraw','expected_success':True,'effect':'withdraw_after_transfer',
                               'transaction_hash':row['receipt']['transactionHash'],'before':[str(x) for x in before],
                               'after':[str(x) for x in after],'pass':True})
            return {'cases':self.cases,'final_snapshot':[str(x) for x in after],
                    'snapshot_layout':'3*(owner,epoch,credit,stake,nonce,approval); totalCredits,dust,messageCount; token balances(probe,A,B,wallet,hook); allowances(A,B,wallet,hook); supply; callback(attempts,success,error,length); NFT balances(A,B,wallet,hook); A-to-hook operator approval'}

    record={'schema':'caw-paid-adversarial/1','utc':datetime.now(timezone.utc).isoformat(),
            'complete':False,'inputs':pins,'baseline_commit':'91479b6dc8c9a264411d75177d43029e0266c354',
            'synthetic_only':True,'historical_caw_execution':False,'real_wallet_used':False,
            'public_transaction_broadcast':False,'public_test_key_scalars':[hex(x) for x in base.TEST_KEYS.values()]}
    node=run=None
    try:
        node=node_module.SyntheticNode(args.anvil,args.output.parent/(args.output.stem+'-work'))
        with node:
            run=Regression(node)
            record.update(run.run())
        need(node.receipt()['stop_reason'] is None,'NODE_STOP')
        need(not node.remote_calls,'NO_REMOTE_CALLS')
        record['complete']=True
    except Exception as error:
        message=str(error)
        record['failure']=message if isinstance(error,RuntimeError) and re.fullmatch(r'[A-Za-z0-9_.:/-]{1,160}',message) else type(error).__name__
    finally:
        if run:
            record.update(transactions=run.rows,cases=run.cases,intents=run.intents,deployments=run.deployments)
        if node:
            record.update(node=node.receipt(),local_calls=node.calls,upstream_calls=node.remote_calls)
        encoded=(json.dumps(record,indent=2)+'\n').encode()
        need(len(encoded)<8*1024*1024,'CAPTURE_BOUND')
        with args.output.open('xb') as stream:
            stream.write(encoded)
    print(json.dumps({'complete':record['complete'],'failure':record.get('failure'),
                      'cases':len(record.get('cases',[])),'transactions':len(record.get('transactions',[])),
                      'bytes':len(encoded)}))
    return 0 if record['complete'] else 1


if __name__=='__main__':
    sys.exit(main())
