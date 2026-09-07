import { UNIT, createState, previewAction, applyAction, rebuild, canonicalExport, formatAmount, countCharacters } from './model.mjs';
import {inspectMedia,validateVideoMetadata,MEDIA_LIMITS} from './media.mjs';
import {loadEnvironment} from './deployment.mjs';
import {createCheckpoint,verifyHistory} from './history.mjs';
import {allocateFee,DEMO_FEES} from './economics.mjs';
import {createDemoSigner} from './signatures.mjs';
import {createSignedLedger} from './signed-ledger.mjs';

const $ = id => document.getElementById(id);
const paths = {
  feed:'M3 4h14v12H3z M6 8h8 M6 12h5',
  account:'M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M4 17v-1a6 6 0 0 1 12 0v1',
  receipts:'M5 2h10v16l-2-1-3 1-3-1-2 1V2 M8 6h4 M8 10h4',
  operators:'M3 5h14v4H3z M3 12h14v4H3z M6 7h.1 M6 14h.1',
  messages:'M3 3h14v11H8l-5 3V3 M6 7h8 M6 10h5',
  heart:'M10 17 3.4 10.3A4.2 4.2 0 0 1 10 5a4.2 4.2 0 0 1 6.6 5.3L10 17',
  repeat:'M4 7h11l-3-3 M16 13H5l3 3 M4 7v4 M16 13V9',
  arrow:'M4 10h12 M11 5l5 5-5 5',
  globe:'M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0 M2 10h16 M10 2c-5 5-5 11 0 16 M10 2c5 5 5 11 0 16',
  check:'m4 10 4 4 8-9',
  lock:'M5 9h10v8H5z M7 9V6a3 3 0 0 1 6 0v3'
};
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 20 20'); svg.setAttribute('aria-hidden','true'); svg.classList.add('icon');
  const path = document.createElementNS(svg.namespaceURI,'path'); path.setAttribute('d',paths[name] || paths.arrow); svg.append(path); return svg;
}
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key,value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'onClick') node.addEventListener('click',value);
    else if (key === 'onSubmit') node.addEventListener('submit',value);
    else if (key === 'text') node.textContent = value;
    else if (value === true) node.setAttribute(key,'');
    else if (value !== false && value !== null && value !== undefined) node.setAttribute(key,String(value));
  }
  for (const child of children.flat()) if (child !== null && child !== undefined) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}
const button = (label, action, kind='secondary', attrs={}) => el('button',{type:'button',class:`button ${kind}`,onClick:action,...attrs},label);
const money = value => `${formatAmount(value)} CAW`;
const labelFor = kind => ({caw:'Public CAW',like:'Like',recaw:'ReCAW',follow:'Follow',transfer:'Account transfer'}[kind] || kind);
let seed, state, selected='pioneer', activeView='feed', draft='', pending=null, reviewIntent=null, operator='A';
let commonsQuery='', commonsView='all';
let mediaCleanup=null;
let signatureCleanup=null;
const sessionBookmarks=new Map();
function savedForAccount(){
  if(!sessionBookmarks.has(selected))sessionBookmarks.set(selected,new Set());
  return sessionBookmarks.get(selected);
}
const views = {feed:'Commons',media:'Media',account:'Identity',receipts:'Ledger',operators:'Readers',messages:'Messages'};
function announce(text, error=false) { const node=$('notice'); node.hidden=false; node.className=error?'notice error':'notice'; node.textContent=text; }
function hideNotice(){ $('notice').hidden=true; }
function focusAfterRender(id='main', preventScroll=false){
  const target=$(id);
  (target && !target.disabled ? target : $('main')).focus({preventScroll});
}
function errorText(error) { return `Action not applied. ${error.message || 'The local record could not be validated.'}`; }
function identity(name) {
  return el('div',{class:'identity terminal-identity'},
    el('span',{class:'identity-prompt','aria-hidden':'true'},'$$'),
    el('div',{},el('span',{class:'identity-name'},name),el('span',{class:'identity-tag'},'SYNTHETIC ACCOUNT'))
  );
}
function details(rows) { return el('dl',{class:'details-list'},rows.map(([key,value])=>el('div',{class:'detail-row'},el('dt',{},key),el('dd',{},value)))); }
function navigate(view, focus=true){
  activeView=Object.hasOwn(views,view)?view:'feed'; history.replaceState(null,'',`#${activeView}`); hideNotice(); render();
  if(focus) $('main').focus({preventScroll:true});
}
function intent(kind, extra={}){
  const account=state.accounts[selected];
  return {id:`event-${state.events.length+1}`,kind,actor:selected,controller:account.controller,epoch:account.epoch,nonce:account.nonce,...extra};
}
function review(kind, extra={}){
  if(pending){announce('Finish or discard the current demo action first.',true);return;}
  try{
    reviewIntent=intent(kind,extra);
    const quote=previewAction(state,reviewIntent);
    $('review-title').textContent=`Review ${labelFor(kind).toLowerCase()}`;
    $('review-content').replaceChildren(...[
      el('p',{class:'muted small'},'This queues a synthetic action. It does not sign, transfer tokens, or publish to a network.'),
      details([['From',`$$ ${selected}`],['Destination',kind==='caw'?'Public demo record / commons':kind==='transfer'?'Synthetic account controller':`$$ ${quote.target || extra.target || 'stake pool'}`],['Total cost',money(quote.fee)],['Scenario','Recommended appendix · demo']]),
      quote.allocations.length?el('div',{},el('h3',{},'Where it goes'),details(quote.allocations.map(item=>[`$$ ${item.account} · ${item.reason}`,money(item.amount)]))):null,
      BigInt(quote.poolDustAdded)>0n?el('p',{class:'inline-note'},`${quote.poolDustAdded} base ${quote.poolDustAdded==='1'?'unit remains':'units remain'} in the visible synthetic rounding reserve. Production rounding is unresolved.`):null,
      extra.text!==undefined?el('p',{class:'receipt-text'},extra.text):null,
      kind==='transfer'?el('p',{class:'inline-note'},`The demo controller changes to ${extra.newController}. Previous-controller intents will be rejected. No NFT or private-message history moves.`):null
    ].filter(node=>node!==null));
    $('review-dialog').showModal();
  }catch(error){reviewIntent=null;announce(errorText(error),true);}
}
function queue(){
  if(!reviewIntent)return;
  pending={intent:reviewIntent,stage:'queued'};
  reviewIntent=null; $('review-dialog').close(); render(); announce('Demo action queued. Balance is unchanged until simulated confirmation.'); focusAfterRender('advance-action');
}
function advance(){
  if(!pending)return;
  if(pending.stage==='queued'){pending.stage='submitted';render();announce('Demo submission recorded. It is still not settled.');focusAfterRender('advance-action');return;}
  if(pending.stage!=='submitted')return;
  try{
    const next=applyAction(state,pending.intent);
    if(pending.intent.kind==='caw' && draft===pending.intent.text)draft='';
    state=next; pending=null; render(); announce('Simulated settlement confirmed. The updated balance and receipt are available.'); focusAfterRender('main',true);
  }catch(error){pending.stage='failed';pending.error=errorText(error);render();announce(pending.error,true);focusAfterRender('discard-action');}
}
function renderPending(){
  const node=$('pending');node.hidden=!pending;if(!pending){node.replaceChildren();return;}
  node.replaceChildren(el('div',{class:'card pending-card'},el('span',{class:'eyebrow'},'SIMULATION IN PROGRESS'),el('h3',{},`${labelFor(pending.intent.kind)} from $$ ${pending.intent.actor}`),
    el('ol',{class:'timeline'},['Queued','Submitted','Confirmed'].map((title,i)=>el('li',{class:(i===0 || (i===1 && pending.stage==='submitted'))?'reached':''},`${title} · demo`))),
    el('p',{class:'muted small'},pending.error || 'No network call or real funds. Each step is advanced locally.'),
    el('div',{class:'pending-actions'},button('Discard demo action',()=>{pending=null;render();announce('Queued action discarded. Balances are unchanged.');focusAfterRender('main',true);},'secondary',{id:'discard-action'}),pending.stage!=='failed'?button(pending.stage==='queued'?'Submit demo action':'Confirm demo settlement',advance,'primary',{id:'advance-action'}):null)));
}
function renderContext(){
  const account=state.accounts[selected];
  const select=el('select',{id:'demo-identity',class:'account-select','aria-label':'Select synthetic account'},
    Object.keys(state.accounts).map(name=>el('option',{value:name},'$$ '+name)));
  select.value=selected;
  select.addEventListener('change',()=>{
    selected=select.value;render();announce('Selected synthetic account $$ '+selected+'.');focusAfterRender('demo-identity',true);
  });
  const inspectorRows=rows=>{const node=details(rows);node.classList.add('inspector-rows');return node;};
  $('context').replaceChildren(
    el('div',{class:'terminal-inspector'},
      el('section',{class:'inspector-block'},
        el('h2',{class:'inspector-title'},'01 / IDENTITY'),
        el('label',{for:'demo-identity',class:'field-label'},'Act as'),select,
        el('div',{class:'inspector-balance'},formatAmount(account.balance)),
        el('p',{class:'inspector-unit'},'SYNTHETIC CAW'),
        inspectorRows([['Controller',account.controller],['Epoch',account.epoch],['Next nonce',account.nonce]]),
        el('button',{type:'button',class:'text-action',onClick:()=>navigate('account')},'inspect identity →')),
      el('section',{class:'inspector-block'},
        el('h2',{class:'inspector-title'},'02 / ACTION COST'),
        inspectorRows([['CAW','5,000'],['Like','2,000'],['ReCAW','4,000'],['Follow','30,000']]),
        el('p',{class:'source-note'},'Synthetic CAW · appendix demo scenario. Production economics remain open.')),
      el('section',{class:'inspector-block'},
        el('h2',{class:'inspector-title'},'03 / LOCAL RECORD'),
        inspectorRows([['Reader',operator],['Applied events',state.events.length],['Held dust',state.poolDust+' base units']]),
        el('button',{type:'button',class:'text-action',onClick:()=>navigate('receipts')},'open ledger →')),
      el('section',{class:'inspector-block inspector-scope'},
        el('h2',{class:'inspector-title'},'SCOPE'),
        el('p',{},'Synthetic state only. No wallet or public network.'),
        el('p',{class:'source-note'},'Community implementation under review.'))
    )
  );
}
function renderFeed(){
  const shell=el('section',{class:'commons-shell','aria-label':'Local commons conversation'});
  const search=el('input',{id:'commons-search',class:'commons-search',type:'search',placeholder:'Find text or $$ handle',maxlength:120,autocomplete:'off',spellcheck:'false','aria-describedby':'commons-scope'});
  search.value=commonsQuery;
  const view=el('select',{id:'commons-view',class:'commons-view','aria-label':'Local conversation view'},
    el('option',{value:'all'},'All voices'),el('option',{value:'following'},'Following'),el('option',{value:'saved'},'Saved locally'));
  view.value=commonsView;
  const summary=el('p',{id:'commons-results',class:'commons-summary','aria-live':'polite','aria-atomic':'true'});
  const board=el('div',{class:'participant-board','aria-label':'Synthetic participant lanes'});
  shell.append(
    el('header',{class:'commons-toolbar'},
      el('div',{},el('h2',{class:'channel-label'},'/commons'),el('p',{id:'commons-scope',class:'commons-scope'},'One view of the local record. No live room or presence.')),
      el('div',{class:'commons-filters'},
        el('div',{class:'filter-field'},el('label',{for:'commons-search',class:'field-label'},'Search this session'),search),
        el('div',{class:'filter-field'},el('label',{for:'commons-view',class:'field-label'},'Show'),view))),
    summary,board
  );

  function updateBoard(){
    const query=commonsQuery.trim().toLowerCase();
    const followed=new Set(state.follows.filter(entry=>entry.actor===selected).map(entry=>entry.target));
    const saved=savedForAccount();
    const participants=Object.keys(state.accounts).filter(name=>commonsView==='following'?followed.has(name):commonsView==='saved'?state.posts.some(post=>post.author===name&&saved.has(post.id)):true);
    const confirmed=new Set(state.events.filter(event=>event.intent.kind==='caw').map(event=>event.receipt.postId));
    let shown=0;
    board.replaceChildren();
    if(!participants.length){
      board.append(el('div',{class:'commons-empty'},
        el('p',{},commonsView==='saved'?'No saved messages for this synthetic identity. Saves stay in this tab and reset on refresh.':'No followed lanes yet. Choose All voices to follow a synthetic account.'),
        el('button',{type:'button',class:'text-action',onClick:()=>{
          commonsView='all';view.value='all';updateBoard();view.focus();
        }},'show all voices →')));
    }
    for(const name of participants){
      const isSelf=name===selected;
      const allPosts=state.posts.filter(post=>post.author===name);
      const posts=allPosts.filter(post=>(commonsView!=='saved'||saved.has(post.id))&&(!query||('$$ '+post.author+'\n'+post.id+'\n'+post.text).toLowerCase().includes(query)));
      shown+=posts.length;
      const lane=el('section',{class:'participant-lane'+(isSelf?' lane-selected':''),'aria-label':'Synthetic messages from '+name});
      const heading=el('header',{class:'lane-header'},
        el('div',{},el('h3',{class:'lane-handle'},'$$ '+name),
          el('p',{class:'lane-meta'},(isSelf?'selected identity · ':'')+posts.length+' / '+allPosts.length+' records')));
      if(!isSelf){
        const done=followed.has(name);
        heading.append(el('button',{type:'button',class:'text-action lane-follow',disabled:done||Boolean(pending),
          'aria-label':done?'Already following '+name+' in this session':'Follow '+name+' for 30,000 synthetic CAW',
          title:done?'Applied in this local session':'30,000 synthetic CAW; review required',
          onClick:()=>review('follow',{target:name})},done?'following':'follow · 30,000'));
      }
      lane.append(heading);
      const messages=el('div',{class:'lane-messages'});
      if(!posts.length)messages.append(el('p',{class:'lane-empty'},query?'No records match this search.':'No committed demo messages in this lane.'));
      for(const post of posts){
        const actions=el('div',{class:'message-actions'});
        for(const [kind,label,cost] of [['like','like','2,000'],['recaw','reCAW','4,000']]){
          const interactions=kind==='like'?state.likes:state.recaws;
          const done=interactions.some(entry=>entry.actor===selected&&entry.postId===post.id);
          actions.append(el('button',{type:'button',class:'text-action',disabled:isSelf||done||Boolean(pending),
            'aria-label':label+' message '+post.id+' by '+name+' for '+cost+' synthetic CAW',
            title:isSelf?'Self-interactions are disabled in this demo':done?'Already applied in this session':cost+' synthetic CAW; review required',
            onClick:()=>review(kind,{postId:post.id})},done?label+' applied':label+' · '+cost));
        }
        actions.append(el('button',{type:'button',class:'text-action',id:'save-'+post.id,'aria-pressed':String(saved.has(post.id)),
          'aria-label':(saved.has(post.id)?'Unsave':'Save')+' message '+post.id+' in this tab',
          onClick:()=>{
            if(saved.has(post.id))saved.delete(post.id);else saved.add(post.id);
            updateBoard();focusAfterRender('save-'+post.id,true);
            announce('Local bookmark updated for $$ '+selected+'. No fee or public event. Saves reset on refresh.');
          }},saved.has(post.id)?'[ saved ]':'save'));
        actions.append(el('button',{type:'button',class:'text-action',disabled:Boolean(pending),
          'aria-label':'Reference message '+post.id+' in an ordinary CAW draft',
          onClick:()=>{
            const reference='re '+post.id+' / $$ '+post.author;
            draft+=(draft?'\n':'')+reference+'\n';
            render();focusAfterRender('compose-text');
            announce('Reference added as ordinary text. The full draft uses the normal CAW limit and cost; no authenticated reply relationship is created.');
          }},'reference'));
        messages.append(el('article',{class:'conversation-message','aria-label':'Message '+post.id},
          el('div',{class:'message-meta'},el('span',{},confirmed.has(post.id)?'confirmed · demo':'seed fixture'),el('span',{title:post.id},post.id)),
          el('p',{class:'message-text',dir:'auto'},post.text),
          actions));
      }
      if(commonsView!=='saved')for(const event of state.events.filter(event=>event.intent.kind==='recaw'&&event.intent.actor===name)){
        const original=state.posts.find(post=>post.id===event.intent.postId);
        if(!original||query&&!('$$ '+name+' '+original.author+' '+original.id+' '+original.text).toLowerCase().includes(query))continue;
        messages.append(el('article',{class:'recaw-reference','aria-label':'ReCAW reference '+event.intent.id},
          el('p',{class:'message-meta'},'reCAW · '+event.intent.id+' · original by $$ '+original.author),
          el('p',{class:'message-text',dir:'auto'},original.text),
          el('p',{class:'source-note'},'Reference to '+original.id+'. Derived from the settled demo reCAW; not a new post.')));
      }
      lane.append(messages);board.append(lane);
    }
    summary.textContent=participants.length+(participants.length===1?' lane · ':' lanes · ')+shown+(shown===1?' original message':' original messages')+(query?' · filtered':'')+(commonsView==='saved'?' · saves reset on refresh':' · seed + settled demo records')+'.';
  }
  search.addEventListener('input',()=>{
    commonsQuery=search.value.slice(0,120);
    if(search.value!==commonsQuery)search.value=commonsQuery;
    updateBoard();
  });
  view.addEventListener('change',()=>{
    commonsView=['following','saved'].includes(view.value)?view.value:'all';
    updateBoard();
  });
  updateBoard();

  const text=el('textarea',{id:'compose-text',class:'draft-textarea',placeholder:'Write here. Review before it joins the local record.',rows:4,maxlength:4096,
    'aria-label':'Own local draft for '+selected,'aria-describedby':'compose-count compose-rule draft-scope',dir:'auto'});
  text.value=draft;
  const count=el('span',{id:'compose-count',class:'counter'},'0 / 420');
  const submit=button('Review CAW',()=>review('caw',{text:draft}),'primary');
  function updateDraft(){
    draft=text.value;
    try{
      const n=countCharacters(draft);
      count.textContent=n+' / 420';count.classList.toggle('over',n>420);
      submit.disabled=!draft.trim()||n>420||Boolean(pending);
    }catch{
      count.textContent='Invalid Unicode text';count.classList.add('over');submit.disabled=true;
    }
  }
  text.addEventListener('input',updateDraft);updateDraft();
  shell.append(el('section',{class:'draft-terminal','aria-label':'Own draft. Local until explicitly reviewed and simulated.'},
    el('header',{class:'draft-header'},el('h2',{},'OWN DRAFT'),el('span',{class:'draft-status'},'$$ '+selected+' → /commons')),
    el('label',{for:'compose-text',class:'field-label'},'Compose a public demo CAW'),text,
    el('p',{id:'draft-scope',class:'draft-scope'},'Only this tab. Nothing is sent while you type. Review, queue and confirm remain explicit demo steps.'),
    el('div',{class:'draft-footer'},
      el('div',{class:'compose-meta'},count,el('span',{id:'compose-rule',class:'muted small'},'Provisional code-point limit · 5,000 synthetic CAW')),
      submit)));
  return shell;
}
function renderSignatureLab(){
  const account=state.accounts[selected];
  const result=el('div',{'aria-live':'polite'});
  const packetField=el('textarea',{class:'data-field',readonly:true,'aria-label':'Signed synthetic example',spellcheck:false});
  const ledgerField=el('textarea',{class:'data-field',readonly:true,'aria-label':'Copied lab ledger',spellcheck:false});
  const summary=el('div');
  const ledgerSummary=el('div');
  let signer=null,ledger=null,packet='',generation=0,mounted=true,busy=false;
  function controls(){
    create.disabled=busy;
    for(const control of [check,accept,tamper])control.disabled=busy||!packet;
    transfer.disabled=busy||!packet||ledger?.status().epoch!==account.epoch;
  }
  function clear(){
    generation+=1; signer?.revoke(); ledger?.revoke(); signer=null;ledger=null;packet='';packetField.value='';ledgerField.value='';ledgerSummary.replaceChildren();
  }
  function showLedger(){
    const current=ledger.status();ledgerField.value=ledger.snapshot();
    ledgerSummary.replaceChildren(el('h3',{},'Copied ledger'),details([['Copied balance',money(current.balance)],['Controller',current.controller],
      ['Ownership epoch',current.epoch],['Next action number',current.nextNonce],['Total copied events',current.events],['Signatures accepted here',current.acceptedSignatures]]));
  }
  signatureCleanup=()=>{mounted=false;clear();};
  async function work(operation){
    if(busy)return;
    busy=true;controls();
    try{await operation();}
    catch(error){if(mounted)result.replaceChildren(el('p',{class:'notice error'},'Example rejected. '+error.message));}
    finally{busy=false;if(mounted)controls();}
  }
  const create=button('Create signed example',()=>work(async()=>{
    clear(); const current=generation;
    result.replaceChildren(el('p',{},'Preparing a temporary test key…'));summary.replaceChildren();
    const nextSigner=await createDemoSigner();
    if(!mounted||current!==generation){nextSigner.revoke();return;}
    signer=nextSigner;
    const now=Math.floor(Date.now()/1000),domain='lab-'+crypto.randomUUID();
    ledger=createSignedLedger(state,{domain,account:account.name,controller:account.controller,epoch:account.epoch,publicKey:signer.publicKey});
    const action={account:account.name,controller:account.controller,deployment:'unconnected-lab',domain,epoch:account.epoch,
      expiresAt:now+300,fee:DEMO_FEES.caw,kind:'caw',network:'simulation',nonce:account.nonce,notBefore:now,
      scenario:'appendix-demo-v1',text:'Check the words. Keep the signature.',version:1};
    const signed=await signer.sign(action);
    if(!mounted||current!==generation)return;
    packet=signed;packetField.value=packet;
    showLedger();
    summary.replaceChildren(details([['Account',account.name],['Example action','Public CAW'],['Example cost',money(action.fee)],['Action number',action.nonce],['Valid for','Five minutes']]));
    result.replaceChildren(el('p',{class:'check-result'},'Example signed. The copied ledger is unchanged until you accept it.'));
  }),'primary');
  const check=button('Verify example',()=>work(async()=>{
    const current=generation;await ledger.check(packet);
    if(mounted&&current===generation)result.replaceChildren(el('p',{class:'check-result'},'Signature and accounting checks passed. The copied ledger is unchanged.'));
  }));
  const accept=button('Accept in copied ledger',()=>work(async()=>{
    const current=generation,receipt=await ledger.accept(packet);
    if(mounted&&current===generation){
      showLedger();result.replaceChildren(el('p',{class:'check-result'},'Accepted in the copy. '+money(receipt.fee)+' allocated; post, receipt and action number updated together. Commons is unchanged.'),
        details(receipt.allocations.map(allocation=>[allocation.account+' / '+allocation.reason,money(allocation.amount)])));
    }
  }));
  const tamper=button('Change example text',()=>{
    if(busy||!packet)return;
    const altered=JSON.parse(packet);altered.action.text='These words were changed after signing.';
    packet=JSON.stringify(altered);packetField.value=packet;
    result.replaceChildren(el('p',{},'Text changed; the original signature is retained. Verify it to inspect the rejection.'));
  });
  const transfer=button('Change copied controller',()=>work(async()=>{
    ledger.simulateTransfer(account.controller==='device-lab-next'?'device-lab-other':'device-lab-next');
    showLedger();result.replaceChildren(el('p',{},'Copied controller changed by an unsigned test control. The old signed example must now fail. No NFT was transferred; Commons is unchanged.'));
  }));
  controls();
  return el('details',{class:'card signature-lab'},el('summary',{},'Test a signed action'),
    el('p',{},'A temporary key signs a fixed example for a copy of this demo ledger. Acceptance spends synthetic CAW and adds a post only in that copy. No wallet or real payment; these keys do not prove account ownership.'),
    el('p',{class:'small muted'},'Create, verify and accept twice to check replay rejection. Create a fresh copy before testing changed text or a changed controller. Leaving this view clears the copy.'),
    el('div',{class:'pending-actions'},create,check,accept,tamper,transfer),summary,result,ledgerSummary,
    el('details',{},el('summary',{},'Inspect signed bytes'),packetField),
    el('details',{},el('summary',{},'Inspect copied ledger'),ledgerField),
    el('p',{class:'source-note'},'Native Ed25519 signatures · local trust and clock · no Ethereum wallet compatibility or durable replay protection.'),
    el('a',{href:'https://github.com/Xubu-Trad/caw-social-alpha/blob/main/docs/SIGNATURE_LAB.md',rel:'noreferrer noopener'},'Read the format, tests and limits'));
}
function renderAccount(){
  const account=state.accounts[selected];
  const nameInput=el('input',{id:'name-preview',class:'text-input',placeholder:'a lowercase name',autocomplete:'off',maxlength:32,'aria-describedby':'name-result'});
  const nameResult=el('p',{id:'name-result',class:'inline-note'},'Enter a name to inspect the historical recommended burn. No minting occurs.');
  nameInput.addEventListener('input',()=>{
    const name=nameInput.value;
    if(!name){nameResult.textContent='Enter a name to inspect the historical recommended burn. No minting occurs.';return;}
    if(!/^[a-z0-9]{1,32}$/.test(name)){nameResult.textContent='Use lowercase a–z and digits 0–9. This demo has a provisional 32-character cap.';return;}
    const values=['1000000000000','240000000000','60000000000','6000000000','200000000','20000000','10000000','1000000'];
    const burn=BigInt(values[Math.min(name.length,8)-1])*UNIT;
    nameResult.textContent=`${name.length} characters · ${money(burn)} recommended burn. ${Object.hasOwn(state.accounts,name)?'Already used in this fixture.':'Not present in this fixture; live availability is unknown.'} No NFT is minted.`;
  });
  const newController=el('input',{id:'transfer-controller',class:'text-input',value:'device-next',maxlength:48,autocomplete:'off','aria-describedby':'transfer-note'});
  return el('div',{},el('p',{class:'section-intro'},'Inspect a synthetic account. Its balance, controller and ownership epoch belong only to this local demonstration.'),
    el('section',{class:'card'},identity(selected),el('div',{class:'mini-rule'}),el('div',{class:'metrics'},el('div',{class:'metric'},el('span',{class:'eyebrow'},'DEMO BALANCE'),el('div',{class:'value'},formatAmount(account.balance)),el('span',{class:'unit'},'SYNTHETIC CAW')),el('div',{class:'metric'},el('span',{class:'eyebrow'},'FIXTURE STAKE WEIGHT'),el('div',{class:'value'},account.stake),el('span',{class:'small muted'},'Provisional, fixed units'))),details([['Synthetic controller',account.controller],['Ownership epoch',account.epoch],['Next action nonce',account.nonce],['Held rounding reserve',`${state.poolDust} base units`]])),
    el('section',{class:'card'},el('span',{class:'eyebrow'},'A NAME, WITHOUT THE GUESSWORK'),el('h3',{},'Inspect a username'),el('label',{for:'name-preview',class:'field-label'},'Proposed name'),nameInput,nameResult,el('p',{class:'source-note'},'The recommendation is preserved for comparison. Zero-address burn compatibility and production name limits are unresolved.')),
    el('section',{class:'card'},el('span',{class:'eyebrow'},'OWNERSHIP DEMONSTRATION'),el('h3',{},'Transfer demo control'),el('p',{id:'transfer-note',class:'small muted'},'Change this fixture account’s controller. Previous-controller actions become invalid; this does not transfer an NFT or any private messages.'),el('div',{class:'form-row'},el('div',{class:'field'},el('label',{for:'transfer-controller',class:'field-label'},'New synthetic controller'),newController),button('Review demo transfer',()=>review('transfer',{newController:newController.value}),'secondary',{disabled:Boolean(pending)}))),
    renderSignatureLab()
  );
}
function receiptCard(receipt){
  const rows=[['Account','$$ '+receipt.actor]];
  if(receipt.target!==undefined)rows.push(['Target account','$$ '+receipt.target]);
  if(receipt.postId!==undefined)rows.push(['Message',receipt.postId]);
  if(receipt.newController!==undefined)rows.push(['New controller',receipt.newController]);
  rows.push(['Total cost',money(receipt.fee)],['Status','Simulated confirmation'],['Scenario','Recommended appendix · demo']);
  if(receipt.newController!==undefined&&Number.isSafeInteger(receipt.nextEpoch))rows.push(['Epoch after transfer',receipt.nextEpoch]);
  if(Number.isSafeInteger(receipt.nextNonce))rows.push(['Next account nonce',receipt.nextNonce]);
  return el('article',{class:'card receipt'},el('div',{class:'receipt-heading'},el('div',{},el('span',{class:'receipt-id'},receipt.id),el('h3',{},labelFor(receipt.kind))),el('span',{class:'tag'},'SIMULATED')),
    details(rows),
    receipt.text!==undefined?el('p',{class:'receipt-text',dir:'auto'},receipt.text):null,
    receipt.allocations.length?el('details',{},el('summary',{},'Inspect payment recipients'),details(receipt.allocations.map(item=>['$$ '+item.account+' · '+item.reason,money(item.amount)])),el('p',{class:'small muted'},'Rounding reserve addition: '+receipt.poolDustAdded+' base units.')):null,
    el('p',{class:'source-note'},'Local simulation only. This receipt is not a wallet signature or proof of blockchain inclusion.'));
}
function renderEconomicComparison(){
  const kind=el('select',{id:'comparison-action',class:'text-input'},['caw','like','recaw','follow'].map(value=>el('option',{value},labelFor(value))));
  const target=el('select',{id:'comparison-recipient',class:'text-input'},Object.keys(state.accounts).filter(name=>name!==selected).map(name=>el('option',{value:name},name)));
  const output=el('div',{id:'comparison-results','aria-live':'polite'});
  const profiles=[['appendix-demo-v1','Recommended appendix · current demo'],['prose-recipient-interpretation-v1','Proposed 100% recipient interpretation']];
  function compare(){
    target.disabled=kind.value==='caw';
    try{
      const accounts=Object.values(state.accounts).map(({name,stake})=>({name,stake}));
      const fee=DEMO_FEES[kind.value],recipient=target.disabled?null:target.value;
      const rows=profiles.map(([profile,title])=>{
        const quote=allocateFee(kind.value,fee,selected,recipient,accounts,profile);
        return el('section',{class:'economic-result'},el('h4',{},title),details([
          ['Example cost',money(fee)],['Direct recipient credit',money(quote.directAmount)],
          ...(recipient?[['Recipient total including pool',money(quote.allocations.filter(item=>item.account===recipient).reduce((sum,item)=>sum+BigInt(item.amount),0n))]]:[]),
          ['Pool amount',money(quote.poolAmount)],['Rounding held',quote.poolDustAdded+' base units']
        ]),el('details',{},el('summary',{},'Each recipient'),details(quote.allocations.map(item=>[item.account+' · '+item.reason,money(item.amount)]))));
      });
      output.replaceChildren(...rows);
    }catch(error){output.replaceChildren(el('p',{class:'notice error'},`Comparison unavailable. ${error.message}`));}
  }
  kind.addEventListener('change',compare);target.addEventListener('change',compare);compare();
  return el('details',{class:'card economic-comparison'},el('summary',{},'Compare source payment descriptions'),
    el('p',{},`Allocation example for ${selected}. This does not charge an account, check its balance or change the active payment rules.`),
    el('p',{},'The source contains different descriptions. Both examples keep fees and demo stake assumptions fixed. The 100% recipient option is an interpretation for review.'),
    el('div',{class:'form-row'},el('div',{class:'field'},el('label',{for:'comparison-action',class:'field-label'},'Action'),kind),
      el('div',{class:'field'},el('label',{for:'comparison-recipient',class:'field-label'},'Recipient'),target)),output,
    el('p',{class:'source-note'},'Direct credit and a recipient’s pool share are listed separately. Pool weights are fixed for this demo; the payer is excluded. C-002 and C-007 remain open.'),
    el('a',{href:'https://github.com/Xubu-Trad/caw-social-alpha/blob/main/docs/ECONOMIC_SCENARIOS.md',rel:'noreferrer noopener'},'Read the source passages and assumptions'));
}
function renderReceipts(){
  const container=el('div',{},el('p',{class:'section-intro'},'Synthetic costs, recipients and controller changes. Every entry is local.'));
  container.append(renderEconomicComparison());
  if(!state.receipts.length)container.append(el('section',{class:'card empty'},icon('receipts'),el('h2',{},'Nothing settled yet.'),el('p',{},'Review a CAW, like, reCAW or follow, then advance its demo settlement. The receipt will appear here.'),button('Go to commons',()=>navigate('feed'))));
  else container.append(...[...state.receipts].reverse().map(receiptCard));
  return container;
}
function renderHistoryVerifier(){
  const history=el('textarea',{id:'history-input',class:'data-field',maxlength:1048576,spellcheck:'false','aria-describedby':'history-scope'});
  const checkpoint=el('textarea',{id:'checkpoint-input',class:'data-field',maxlength:1024,spellcheck:'false','aria-describedby':'history-scope'});
  const result=el('div',{'aria-live':'polite'});
  let revision=0;
  const changed=()=>{revision+=1;result.replaceChildren();};
  history.addEventListener('input',changed);checkpoint.addEventListener('input',changed);
  const capture=button('Prepare this session',async()=>{
    const generation=++revision, current=state;
    capture.disabled=true;
    try{
      const text=canonicalExport(current), saved=await createCheckpoint(current);
      if(generation!==revision||!history.isConnected)return;
      history.value=text;checkpoint.value=JSON.stringify(saved);
      result.replaceChildren(el('p',{class:'check-result'},'Record and fingerprint prepared. Save them separately before relying on a later comparison.'));
    }catch(error){if(generation===revision&&history.isConnected)result.replaceChildren(el('p',{class:'notice error'},error.message));}
    finally{capture.disabled=false;}
  });
  const verify=button('Verify and rebuild',async()=>{
    const generation=++revision, text=history.value, saved=checkpoint.value;
    verify.disabled=true;result.replaceChildren(el('p',{},'Checking the saved record…'));
    try{
      if(saved.length>1024)throw new Error('The saved fingerprint is too large.');
      const checked=await verifyHistory(text,JSON.parse(saved));
      if(generation!==revision||!history.isConnected)return;
      result.replaceChildren(el('p',{class:'check-result'},`Saved fingerprint matched. ${checked.state.events.length} synthetic events rebuilt.`),
        el('p',{},`${Object.keys(checked.state.accounts).length} accounts · ${checked.state.posts.length} posts · active session unchanged.`),
        el('p',{class:'source-note'},'This checks the supplied record against the fingerprint you supplied. A replacement of both can still pass. It does not verify a blockchain or an author.'));
    }catch(error){if(generation===revision&&history.isConnected)result.replaceChildren(el('p',{class:'notice error'},`Record rejected. ${error instanceof SyntaxError?'Paste a valid saved fingerprint JSON.':error.message}`));}
    finally{verify.disabled=false;}
  },'primary');
  return el('section',{class:'card'},el('h3',{},'Recover a saved record'),
    el('p',{id:'history-scope',class:'small muted'},'Paste a synthetic export and its separately saved fingerprint. Verification stays on this device and does not change the active session. A fingerprint detects changed bytes; it does not prove authorship or complete history.'),
    capture,el('label',{for:'history-input',class:'field-label'},'Exact exported JSON · up to 1 MiB'),history,
    el('label',{for:'checkpoint-input',class:'field-label'},'Saved fingerprint JSON'),checkpoint,verify,result);
}
function renderOperators(){
  const result=el('div',{'aria-live':'polite'});
  const data=el('textarea',{id:'export-data',class:'data-field',readonly:true,'aria-label':'Canonical synthetic export'});data.value=canonicalExport(state);
  const container=el('div',{},el('p',{class:'section-intro'},'A reader should be replaceable. These two local fixture readers rebuild the same synthetic history; neither is a live operator.'),
    ['A','B'].map(name=>el('section',{class:`card operator ${operator===name?'active':''}`},el('div',{},el('h3',{},`Fixture reader ${name}`),el('p',{},'Fresh local reconstruction · no external connection')),button(operator===name?'Selected':'Switch reader',()=>{
      try{state=rebuild(seed,JSON.parse(canonicalExport(state)));operator=name;render();announce(`Fixture reader ${name} reconstructed the same local history.`);focusAfterRender(`reader-${name}`,true);}catch(error){announce(errorText(error),true);}
    },operator===name?'primary':'secondary',{id:`reader-${name}`}))),
    el('section',{class:'card'},el('span',{class:'eyebrow'},'VERIFY THE LOCAL RECORD'),el('h3',{},'Rebuild twice. Compare.'),el('p',{class:'small muted'},'Each reader starts from the original fixture and replays the exported history. Matching results demonstrate deterministic local processing.'),button('Check both reconstructions',async()=>{
      try{
        const snapshot=canonicalExport(state);const envelope=JSON.parse(snapshot);
        const a=canonicalExport(rebuild(seed,envelope));const b=canonicalExport(rebuild(seed,envelope));
        if(a!==b||a!==snapshot)throw new Error('Canonical exports differ.');
        const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(snapshot));
        const hash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
        result.replaceChildren(el('p',{class:'check-result'},`Matching reconstructions · ${state.events.length} synthetic events`),el('p',{class:'hash'},`Export SHA-256: ${hash}`),el('p',{class:'source-note'},'Internal consistency is verified, not authorship. This is not an independent operator or a permanent-storage test.'));
      }catch(error){result.replaceChildren(el('p',{class:'notice error'},errorText(error)));}
    },'primary'),result),
    el('section',{class:'card'},el('h3',{},'Portable demo record'),el('p',{class:'small muted'},'The export contains only this demonstration’s synthetic fixture, history and snapshot. No wallet or private account data.'),data,button('Download synthetic JSON',()=>{
      const blob=new Blob([canonicalExport(state)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=el('a',{href:url,download:'caw-social-demo.json'});document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }),button('Select JSON for copying',()=>{data.focus();data.select();announce('The complete synthetic JSON is selected. Use your device’s copy command.');}),el('p',{class:'source-note'},'If your browser does not download, select the JSON and copy it. This is unencrypted synthetic data. A self-consistent edited export is not evidence of an original signed history.'))
  );
  container.append(renderHistoryVerifier());
  return container;
}
function renderMessages(){
  return el('section',{class:'card empty'},icon('lock'),el('span',{class:'eyebrow'},'PRIVACY BEFORE PROMISES'),el('h2',{},'Messages need a sound foundation.'),el('p',{},'Production messaging is not enabled. Account transfers, historical access, recipient consent and key recovery must be resolved first.'),el('p',{},'This prototype does not accept, store or encrypt private correspondence.'),button('Return to commons',()=>navigate('feed')));
}
function renderMedia(){
  let currentUrl=null,currentElement=null,generation=0,mounted=true,timeout=null;
  const picker=el('input',{type:'file',id:'media-file',accept:'image/png,image/jpeg,image/webp,video/mp4,video/webm','aria-describedby':'media-limits media-scope'});
  const status=el('p',{class:'inline-note',role:'status','aria-live':'polite'},'Choose one file to inspect locally.');
  const preview=el('div',{class:'media-preview',id:'media-preview'});
  const remove=button('Remove local preview',()=>{clear();picker.value='';status.textContent='Preview removed from this tab. The original file is unchanged.';picker.focus();},'secondary',{disabled:true});
  function clear(){
    generation++;
    clearTimeout(timeout);
    if(currentElement?.tagName==='VIDEO'){currentElement.pause();currentElement.removeAttribute('src');currentElement.load();}
    else if(currentElement?.tagName==='IMG')currentElement.removeAttribute('src');
    preview.replaceChildren();currentElement=null;
    if(currentUrl){URL.revokeObjectURL(currentUrl);currentUrl=null;}
    remove.disabled=true;
  }
  mediaCleanup=()=>{mounted=false;clear();};
  picker.addEventListener('change',async()=>{
    clear();const selectedGeneration=generation,file=picker.files?.[0];
    if(!file){status.textContent='No file selected.';return;}
    status.textContent='Checking the local file header…';
    try{
      const info=await inspectMedia(file);
      if(!mounted || generation!==selectedGeneration)return;
      currentUrl=URL.createObjectURL(file);
      currentElement=info.kind==='image'?el('img',{alt:'Selected local image preview',decoding:'async'}):el('video',{controls:true,playsinline:true,preload:'metadata','aria-label':'Selected local video preview'});
      const target=currentElement;
      let metadataReady=false;
      const fail=message=>{if(!mounted || generation!==selectedGeneration)return;clear();picker.value='';status.textContent=message;};
      target.addEventListener('error',()=>fail('The browser could not decode this file. Preview closed; nothing was uploaded.'),{once:true});
      target.addEventListener(info.kind==='image'?'load':'loadedmetadata',()=>{
        if(!mounted || generation!==selectedGeneration)return;
        try{
          if(info.kind==='video'){validateVideoMetadata(target.duration,target.videoWidth,target.videoHeight);metadataReady=true;}
          else if(!target.naturalWidth || !target.naturalHeight || target.naturalWidth>MEDIA_LIMITS.imageEdge || target.naturalHeight>MEDIA_LIMITS.imageEdge || target.naturalWidth*target.naturalHeight>MEDIA_LIMITS.imagePixels)throw new Error('Decoded image exceeds the preview dimensions.');
          clearTimeout(timeout);
          status.textContent=`${info.kind==='image'?'Image':'Video'} preview ready · ${(info.bytes/1024/1024).toFixed(2)} MiB. Stays in this tab; not attached to a CAW.`;
        }catch(error){fail(error.message);}
      },{once:true});
      if(info.kind==='video')for(const eventName of ['durationchange','resize'])target.addEventListener(eventName,()=>{
        if(!metadataReady || !mounted || generation!==selectedGeneration)return;
        try{validateVideoMetadata(target.duration,target.videoWidth,target.videoHeight);}catch(error){fail(error.message);}
      });
      preview.append(target);remove.disabled=false;
      target.src=currentUrl;
      timeout=setTimeout(()=>fail('The preview did not finish loading within 10 seconds. Choose a smaller file.'),10000);
    }catch(error){if(mounted && generation===selectedGeneration){picker.value='';status.textContent=error.message;}}
  });
  return el('section',{class:'media-workspace'},el('h2',{},'Images. Video. Your choice.'),
    el('p',{id:'media-scope'},'Preview only. Stays in this tab. Nothing is uploaded or attached to the public record.'),
    el('label',{for:'media-file',class:'field-label'},'Choose an image or video'),picker,
    el('p',{id:'media-limits',class:'source-note'},'PNG, JPEG or WebP: 4 MiB, 4096 pixels per edge, 16 megapixels. MP4 or WebM: 16 MiB, 60 seconds, 1920 pixels per edge and 2,073,600 total pixels; portrait is supported. No autoplay.'),status,preview,remove,
    el('p',{class:'source-note'},'This checks format headers and preview limits; it is not a malware scan. Metadata is not stripped. A real publication flow will need consent, storage and recovery checks.'),
    el('a',{href:'./website.html#media'},'Read the media publishing plan →'));
}
function render(){
  if(mediaCleanup){mediaCleanup();mediaCleanup=null;}
  if(signatureCleanup){signatureCleanup();signatureCleanup=null;}
  $('page-title').textContent=views[activeView];document.title=`CAW Social · ${views[activeView]} · Alpha simulation`;
  $('navigation').replaceChildren(...Object.entries(views).map(([key])=>el('button',{type:'button',class:`nav-button ${activeView===key?'active':''}`,'aria-current':activeView===key?'page':null,onClick:()=>navigate(key)},icon(key),views[key])));
  renderContext();renderPending();
  $('view').replaceChildren(({feed:renderFeed,media:renderMedia,account:renderAccount,receipts:renderReceipts,operators:renderOperators,messages:renderMessages})[activeView]());
}
$('close-dialog').addEventListener('click',()=>$('review-dialog').close());
$('cancel-dialog').addEventListener('click',()=>$('review-dialog').close());
$('review-dialog').addEventListener('close',()=>{reviewIntent=null;});
$('review-dialog').addEventListener('keydown',event=>{
  if(event.key!=='Tab' || event.ctrlKey || event.altKey || event.metaKey)return;
  const first=$('close-dialog'),last=$('queue-action');
  if(event.shiftKey && (document.activeElement===first || document.activeElement===$('review-dialog'))){event.preventDefault();last.focus();}
  else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
});
$('queue-action').addEventListener('click',queue);
document.querySelector('.skip-link').addEventListener('click',event=>{event.preventDefault();$('main').focus();});
window.addEventListener('hashchange',()=>{
  const view=location.hash.slice(1);
  if(view==='main'){history.replaceState(null,'',`#${activeView}`);$('main').focus();return;}
  if(state)navigate(view,false);
});
try{
  const environment=await loadEnvironment();
  $('alpha-environment').textContent=`Alpha ${environment.release} · simulation · no connected chain`;
  const response=await fetch(new URL('./fixtures.json',import.meta.url),{cache:'no-store',credentials:'omit'});
  if(!response.ok)throw new Error('The local fixture could not be loaded.');
  seed=await response.json();state=createState(seed);
  if(!Object.hasOwn(state.accounts,selected))selected=Object.keys(state.accounts)[0];
  const initialView=location.hash.slice(1);
  navigate(initialView==='main'?'feed':initialView||'feed',initialView==='main');
}catch(error){$('view').replaceChildren(el('section',{class:'card'},el('h2',{},'The demonstration could not start.'),el('p',{class:'muted'},error.message)));}

window.addEventListener('pagehide',()=>{if(mediaCleanup){mediaCleanup();mediaCleanup=null;}if(signatureCleanup){signatureCleanup();signatureCleanup=null;}});
window.addEventListener('pageshow',event=>{if(event.persisted && state)render();});
