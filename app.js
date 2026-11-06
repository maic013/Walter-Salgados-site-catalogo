
(() => {
  'use strict';

  const PRODUCTS = [
    { id:30, units:30, price:24, badge:'PRA MATAR A VONTADE', desc:'Pequeno no tamanho, gigante no sabor.', image:'assets/image-748c6a3b88c8.webp' },
    { id:40, units:40, price:32, badge:'IDEAL PARA DIVIDIR', desc:'A medida certa para um encontro gostoso.', image:'assets/image-6d2102339a7b.webp' },
    { id:50, units:50, price:40, badge:'O QUERIDINHO', desc:'O clássico para aquela comemoração.', image:'assets/image-0734927f1b57.webp' },
    { id:60, units:60, price:48, badge:'PRA REUNIR A GALERA', desc:'Um pouco mais de festa na sua mesa.', image:'assets/image-0c678010bc3a.webp' },
    { id:100, units:100, price:80, badge:'FESTA COMPLETA', desc:'Quando a comemoração pede mais!', image:'assets/image-8c77c1cd5013.webp' },
  ];
  const FLAVORS = [
    { id:'coxinha', name:'Coxinha', icon:'🍗' },
    { id:'pastel', name:'Pastel', icon:'🥟' },
    { id:'quibe', name:'Quibe', icon:'🥙' },
    { id:'enroladinho', name:'Enroladinho', icon:'🌭' },
    { id:'bolinha', name:'Bolinha de queijo', icon:'🧀' },
    { id:'risole', name:'Risole', icon:'✨' },
  ];
  const DRINKS = [
    { id:'coca', name:'Coca-Cola', size:'Lata 350 ml', icon:'🥤' },
    { id:'sprite', name:'Sprite', size:'Lata 350 ml', icon:'🥤' },
    { id:'fanta', name:'Fanta', size:'Lata 350 ml', icon:'🍊' },
    { id:'guarana', name:'Guaraná', size:'Lata 350 ml', icon:'🥤' },
    { id:'agua', name:'Água', size:'Garrafa 500 ml', icon:'💧' },
  ];
  const config = window.WALTER_CONFIG || {};
  const $ = selector => document.querySelector(selector);
  const money = n => Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const escapeHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const getProduct = id => PRODUCTS.find(p => p.id === Number(id));
  const getFlavor = id => FLAVORS.find(f => f.id === id);
  const getDrink = id => DRINKS.find(d => d.id === id);
  const drinkPrice = id => { const p=config.bebidas && config.bebidas[id];return typeof p==='number' && Number.isFinite(p) && p>=0?p:null; };
  // Versão 1.7: pedidos não são recuperados de visitas anteriores.
  const state = {
    items: [], drinks:{}, customer:{name:'',phone:''}, method:'pickup',
    date:'', time:'', scheduleMode:'scheduled', address:'',neighborhood:'',city:'',reference:'', mapLink:'',
    people:'', notes:'', prep:'frito na hora, se possível', drinkCold:true, iceLemon:false
  };
  let step='start';
  let pendingProduct=null, tempMix=null, editingId=null, kitEntrySource='catalog';
  let serial=0, lastFocus=null, toastTimer=null, showPreview=false;
  let lastProgressStep=null, upgradeNotice='', reviewOrigin='drinks', geoPending=false;
  let orderRef=null, orderSubmitting=false, demoSequenceMemory=0;
  let orderRequestId=makeRequestId();
  function makeRequestId(){return globalThis.crypto&&crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;}
  function invalidateOrderReference(){if(orderRef){orderRef=null;orderRequestId=makeRequestId();}}
  function spDate(){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`;}
  function formattedOrderRef(ref){return `${ref.day.slice(8,10)}/${ref.day.slice(5,7)}/${ref.day.slice(0,4)} · Nº ${ref.number}`;}

  const ORDER=['flavors','cart','customer','method','schedule','drinks','review'];

  // Nunca recuperar carrinhos antigos: toda visita começa com 0 kits.
  function safeRestore() { /* intentional: fresh cart per page load */ }
  function save() { /* in-memory until this tab is closed/refreshed */ }
  const itemTotal=()=>state.items.reduce((s,x)=>s+getProduct(x.productId).price,0);
  const drinkTotal=()=>DRINKS.reduce((s,d)=>s+(state.drinks[d.id]||0)*(drinkPrice(d.id)||0),0);
  const unknownDrinks=()=>DRINKS.some(d=>(state.drinks[d.id]||0)>0 && drinkPrice(d.id)===null);
  const hasDrinks=()=>DRINKS.some(d=>(state.drinks[d.id]||0)>0);
  const subtotal=()=>itemTotal()+drinkTotal();
  const count=()=>state.items.length; // contador = número de kits, sem somar bebidas
  const totalUnits=()=>state.items.reduce((s,x)=>s+getProduct(x.productId).units,0);
  const hasWhatsApp=()=>/^55\d{10,11}$/.test(String(config.whatsapp||'').replace(/\D/g,''));
  function toast(text){const el=$('#toast');el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3200);}
  function localToday(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function localTomorrow(){const d=new Date();d.setDate(d.getDate()+1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function formattedDate(s){if(!s)return 'A combinar';const p=s.split('-');return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:s;}
  function mixText(item){
    const p=getProduct(item.productId);
    if(item.mode==='mixed')return 'Misto / sortido a combinar com Walter';
    const parts=Object.entries(item.flavors||{}).filter(([id,n])=>getFlavor(id) && Number(n)>0).map(([id,n])=>`${n}× ${getFlavor(id).name}`);
    return parts.length?parts.join(' · '):`${p.units} unidades — sabores a combinar`;
  }
  function renderProducts(){
    const levels={
      30:{name:'ESSENCIAL',symbol:'✦',rank:1,line:'O começo de uma boa escolha'},
      40:{name:'ENCONTRO',symbol:'✧',rank:2,line:'Mais sabor para compartilhar'},
      50:{name:'FAVORITO',symbol:'♥',rank:3,line:'Seu momento merece mais'},
      60:{name:'ESPECIAL',symbol:'✴',rank:4,line:'Uma celebração à altura'},
      100:{name:'GRANDE FESTA',symbol:'★',rank:5,line:'Mais salgados para reunir a galera'}
    };
    $('#product-grid').innerHTML=PRODUCTS.map(p=>{
      const l=levels[p.units];
      return `<article class="product-card tier-${p.units}" style="--tier-index:${l.rank}">
        <div class="card-aura" aria-hidden="true"></div>
        <div class="product-image"><img src="${p.image}" alt="Foto ilustrativa de salgadinhos variados para o kit de ${p.units} unidades" loading="lazy"><span class="product-badge">${p.badge}</span><span class="product-units-badge">${p.units} salgadinhos</span><span class="product-crown" aria-hidden="true">${l.symbol}</span></div>
        <div class="product-body"><div class="product-label"><span class="tier-level-icon">${l.symbol}</span> ${l.name}<span class="tier-level-bars" aria-label="Categoria visual ${l.rank} de 5">${Array.from({length:5},(_,i)=>`<i class="${i<l.rank?'filled':''}"></i>`).join('')}</span></div>
        <h3>Kit ${p.units} salgados</h3><p class="product-desc">${p.desc}</p><div class="tier-signature">${l.line}</div>
        <div class="product-bottom"><div class="product-price"><small>R$</small> ${p.price}<small>,00</small></div><span>R$ 0,80 / unidade</span></div>
        <button class="product-add" type="button" data-product="${p.id}">Montar meu kit <svg class="icon"><use href="#i-arrow"/></svg></button></div>
      </article>`;
    }).join('');
  }
  function renderHeader(){
    const n=count();
    const badge=$('#cart-bubble'), header=$('#header-cart');
    badge.textContent=n;
    $('#mobile-count').textContent=n;
    $('#mobile-total').textContent=money(subtotal());
    $('#mobile-cart').hidden=n===0;
    header.classList.toggle('has-items',n>0);
    header.setAttribute('aria-label',n?`Abrir meu pedido: ${n} ${n===1?'kit':'kits'} no carrinho`:'Meu pedido está vazio — escolher um kit');
    badge.setAttribute('aria-label',`${n} ${n===1?'kit':'kits'} no carrinho`);
  }
  function pulseCart(){
    const header=$('#header-cart');header.classList.remove('cart-bump');void header.offsetWidth;header.classList.add('cart-bump');
    window.setTimeout(()=>header.classList.remove('cart-bump'),650);
  }
  function openModal(){if($('#modal-overlay').hidden){lastFocus=document.activeElement;$('#modal-overlay').hidden=false;document.body.classList.add('modal-open');}renderStep();$('.order-modal').focus();}
  function closeModal(){if($('#modal-overlay').hidden)return;$('#modal-overlay').hidden=true;document.body.classList.remove('modal-open');lastProgressStep=null;if(lastFocus&&lastFocus.focus)lastFocus.focus();}
  function goto(next){if(next==='review'&&step!=='review')reviewOrigin=step;step=next;showPreview=false;renderStep();}
  function selectKit(id, edit=null){if(orderRef){invalidateOrderReference();toast('As alterações criam uma nova solicitação e exigem novo número.');}kitEntrySource=$('#modal-overlay').hidden?'catalog':(step==='start'?'start':step==='cart'?'cart':'catalog');pendingProduct=getProduct(id);if(!pendingProduct)return;editingId=edit;upgradeNotice='';const old=edit===null?null:state.items.find(x=>x.id===edit);tempMix=old?{mode:old.mode,flavors:{...(old.flavors||{})}}:{mode:'mixed',flavors:{}};step='flavors';openModal();}
  function normalizeCustom(){
    const ids=Object.keys(tempMix.flavors).filter(id=>getFlavor(id));
    if(!ids.length)return;
    const avg=Math.floor(pendingProduct.units/ids.length), remainder=pendingProduct.units%ids.length;
    ids.forEach((id,i)=>tempMix.flavors[id]=avg+(i<remainder?1:0));
  }
  // Auto-compensation keeps the kit total exact at all times. Extra coxinhas
  // are taken fairly from the other selected flavors, without negative counts.
  function adjustMixFlavor(id,desired){
    if(!tempMix || tempMix.mode!=='custom'||!pendingProduct || !Object.hasOwn(tempMix.flavors,id))return;
    const ids=Object.keys(tempMix.flavors).filter(x=>getFlavor(x));
    const max=pendingProduct.units;
    if(ids.length===1){tempMix.flavors[id]=max;return;}
    const old=tempMix.flavors[id];
    const other=ids.filter(x=>x!==id);
    const desiredInt=Math.max(0,Math.min(max,Math.trunc(Number(desired)||0)));
    let diff=desiredInt-old;
    if(diff>0){
      const available=other.reduce((t,k)=>t+tempMix.flavors[k],0);
      diff=Math.min(diff,available);
      for(let i=0;i<diff;i++){
        // Largest first, so a +2 from 10/10/10 becomes 12/9/9.
        const donor=other.filter(k=>tempMix.flavors[k]>0).sort((a,b)=>tempMix.flavors[b]-tempMix.flavors[a] || ids.indexOf(a)-ids.indexOf(b))[0];
        if(!donor)break;
        tempMix.flavors[donor]--;
      }
      tempMix.flavors[id]=old+diff;
    }else if(diff<0){
      for(let i=0;i<(-diff);i++){
        // Fewest first, so shrinking one flavor spreads the freed units evenly.
        const receiver=[...other].sort((a,b)=>tempMix.flavors[a]-tempMix.flavors[b] || ids.indexOf(a)-ids.indexOf(b))[0];
        tempMix.flavors[receiver]++;
      }
      tempMix.flavors[id]=old+diff;
    }
  }
  function updateAllocationUI(){
    if(!tempMix || tempMix.mode!=='custom'||!pendingProduct)return;
    const total=Object.values(tempMix.flavors).reduce((t,n)=>t+(Number(n)||0),0);
    const remaining=pendingProduct.units-total;
    const ids=Object.keys(tempMix.flavors);
    document.querySelectorAll('[data-flavor-number]').forEach(el=>{
      const id=el.dataset.flavorNumber;
      el.value=tempMix.flavors[id];
      el.setAttribute('aria-valuenow',String(tempMix.flavors[id]));
    });
    document.querySelectorAll('[data-action="flavor-adjust"]').forEach(btn=>{
      const id=btn.dataset.value;
      btn.disabled=(ids.length===1)||(Number(btn.dataset.delta)>0 && tempMix.flavors[id]>=pendingProduct.units)||(Number(btn.dataset.delta)<0 && tempMix.flavors[id]===0);
    });
    const meter=$('.remaining-meter');
    if(meter){
      meter.classList.toggle('warning',remaining!==0);
      meter.innerHTML=`<span>${remaining===0?'✓ Kit perfeito! Todas as unidades distribuídas':remaining>0?`Faltam ${remaining} unidades`:`Passou ${-remaining} unidades`}</span><span>${total}/${pendingProduct.units}</span>`;
    }
    const allocation=$('.allocation-card');
    if(allocation){allocation.classList.remove('mix-changed');void allocation.offsetWidth;allocation.classList.add('mix-changed');}
    renderFooter();
  }
  function upgradeKit(){
    if(!pendingProduct || !tempMix)return;
    const current=pendingProduct;
    const next=PRODUCTS.find(p=>p.units>current.units);
    if(!next)return;
    if(tempMix.mode==='single'){
      const selected=Object.keys(tempMix.flavors)[0];
      if(selected)tempMix.flavors={[selected]:next.units};
    }else if(tempMix.mode==='custom'){
      const ids=Object.keys(tempMix.flavors).filter(x=>getFlavor(x));
      if(ids.length){
        const weights=ids.map(id=>({id,exact:tempMix.flavors[id]*next.units/current.units}));
        const newAmounts={};let used=0;
        weights.forEach(x=>{newAmounts[x.id]=Math.floor(x.exact);used+=newAmounts[x.id];});
        const sorted=[...weights].sort((a,b)=>(b.exact-Math.floor(b.exact))-(a.exact-Math.floor(a.exact)) || ids.indexOf(a.id)-ids.indexOf(b.id));
        for(let i=0;i<next.units-used;i++)newAmounts[sorted[i%sorted.length].id]++;
        tempMix.flavors=newAmounts;
      }
    }
    pendingProduct=next;
    upgradeNotice=`Seu kit agora tem ${next.units} unidades por ${money(next.price)}. Os sabores foram mantidos!`;
    renderStep(true);
    toast(`✨ Upgrade feito! Seu kit agora tem ${next.units} salgados.`);
  }
  function pendingValid(){if(!tempMix || !pendingProduct)return false;if(tempMix.mode==='mixed')return true;if(tempMix.mode==='single')return Object.entries(tempMix.flavors).some(([id,v])=>getFlavor(id)&&v===pendingProduct.units);return Object.keys(tempMix.flavors).length>0 && Object.values(tempMix.flavors).reduce((s,n)=>s+(Number(n)||0),0)===pendingProduct.units;}
  function commitKit(){invalidateOrderReference();if(!pendingValid()){toast('Distribua todas as unidades antes de continuar.');return;}const item={id:editingId===null?++serial:editingId,productId:pendingProduct.id,mode:tempMix.mode,flavors:{...tempMix.flavors}};if(editingId!==null){const i=state.items.findIndex(x=>x.id===editingId);if(i>=0)state.items[i]=item;else state.items.push(item);}else state.items.push(item);pendingProduct=null;editingId=null;tempMix=null;save();renderHeader();pulseCart();goto('cart');toast('Kit personalizado adicionado ao seu pedido!');}
  const heads={
    start:['BORA COMEÇAR?','Sua bandeja está vazia!','Escolha um kit e personalize tudo do seu jeito.'],
    flavors:['PRIMEIRO, O MAIS GOSTOSO','Qual vai ser o sabor?','Escolha um sabor só, um mix ou monte cada unidade do seu kit.'],
    cart:['SEU CARRINHO, SUA FESTA','Quer mais algum salgado?','Aqui você pode revisar os kits ou adicionar mais um antes de seguir.'],
    customer:['PRA GENTE TE CONHECER','Como podemos te chamar?','Assim o Walter identifica sua encomenda e combina tudo com você.'],
    method:['VOCÊ ESCOLHE','Como quer receber?','Escolha sua preferência. O Walter vai confirmar a disponibilidade.'],
    schedule:['NO SEU TEMPO','Qual é o melhor momento?','Conte quando deseja seus salgados e deixe os detalhes anotados.'],
    drinks:['UM COMPLEMENTO GELADINHO','Vai uma bebida junto?','Adicione algo para acompanhar. Os valores serão confirmados com Walter.'],
    review:['TUDO PRONTO PARA ENVIAR','Sua comanda está completa!','Confira tudo e envie ao WhatsApp do Walter para confirmar sua solicitação.']
  };
  function renderStep(preserveScroll=false){
    const scroller=$('#modal-scroll');
    const oldScroll=preserveScroll?scroller.scrollTop:0;
    const oldFocused=preserveScroll?document.activeElement:null;
    const focusAction=oldFocused?.dataset?.action||'';
    const focusValue=oldFocused?.dataset?.value||'';
    const [eyebrow,title,subtitle]=heads[step],index=ORDER.indexOf(step),isStart=step==='start';
    $('#modal-eyebrow').textContent=eyebrow;$('#modal-title').textContent=title;$('#modal-subtitle').textContent=subtitle;
    $('#progress-label').textContent=isStart?'ETAPA 1 DE 7 · AINDA SEM KITS':`ETAPA ${index+1} DE 7`;
    $('#progress-percent').textContent=isStart?'0%':`${Math.round((index+1)/7*100)}%`;
    const progress=$('#progress-bar');
    const targetWidth=isStart?'0%':`${(index+1)/7*100}%`;
    if(lastProgressStep===null){
      progress.style.width='0%';
      requestAnimationFrame(()=>{progress.style.width=targetWidth;});
    }else progress.style.width=targetWidth;
    lastProgressStep=step;
    const renderers={start:renderStart,flavors:renderFlavors,cart:renderCart,customer:renderCustomer,method:renderMethod,schedule:renderSchedule,drinks:renderDrinks,review:renderReview};
    $('.order-modal').dataset.step=step;
    $('#modal-content').innerHTML=renderers[step]();
    renderFooter();
    if(preserveScroll && focusAction){const fresh=[...$('#modal-content').querySelectorAll('[data-action]')].find(x=>x.dataset.action===focusAction&&x.dataset.value===focusValue);if(fresh)fresh.focus({preventScroll:true});}
    scroller.scrollTop=oldScroll;
    // Replacing selected tiles must not snap customers to the top of the modal.
    if(preserveScroll)requestAnimationFrame(()=>{if(step==='flavors'||step==='schedule'||step==='method'||step==='drinks')scroller.scrollTop=oldScroll;});
  }
  function footerButton(label,action,disabled=false){return `<button type="button" class="btn btn-primary" data-action="${action}" ${disabled?'disabled':''}>${label} <svg class="icon"><use href="#i-arrow"/></svg></button>`;}
  function renderFooter(){
    const f=$('#modal-footer');const backTarget={start:'close',flavors:editingId===null?(kitEntrySource==='start'?'start':kitEntrySource==='cart'?'cart':'close'):'cart',cart:'close',customer:'cart',method:'customer',schedule:'method',drinks:'schedule',review:reviewOrigin}[step];
    const backLabel=backTarget==='close'?'Voltar à loja':'Voltar';
    let content=`<button type="button" class="btn-back" data-action="back">‹ ${backLabel}</button>`;
    if(step==='start'){content+='<button type="button" class="btn btn-start-browse" data-action="browse-kits">Ver cardápio completo →</button>'; }
    else if(step==='flavors'){content+=footerButton(editingId===null?`Adicionar meu kit · ${money(pendingProduct.price)}`:'Salvar alterações','commit-kit',!pendingValid());}
    else if(step==='cart'){content+=`<div class="footer-total">Subtotal <strong>${money(itemTotal())}</strong></div>`+footerButton('Continuar meu pedido','next',state.items.length===0);}
    else if(step==='customer')content+=footerButton('Escolher recebimento','next');
    else if(step==='method')content+=footerButton('Continuar','next');
    else if(step==='schedule')content+=`<div class="dual-next"><button type="button" class="btn btn-outline-review" data-action="skip-drinks">Revisar comanda ✓</button><button type="button" class="btn btn-drink-next" data-action="next">🥤 Quero ver bebidas →</button></div>`;
    else if(step==='drinks')content+=footerButton('Revisar comanda','next');
    else if(step==='review')content+=`<button type="button" class="btn btn-send-whatsapp ${hasWhatsApp()?'':'whatsapp-unconfigured'}" data-action="send-order"><span>↗</span> Registrar e abrir WhatsApp</button>`;
    f.innerHTML=content;
  }
  function renderStart(){
    return `<section class="empty-start">
      <div class="empty-start-banner"><span class="empty-start-icon">🥟</span><div><small>SEU PEDIDO COMEÇA DO ZERO</small><strong>0 kits na sua bandeja</strong><p>Que tal escolher seus primeiros salgados? Você só adiciona ao carrinho depois de confirmar os sabores.</p></div></div>
      <h3>Escolha seu primeiro kit</h3>
      <div class="empty-kit-grid">${PRODUCTS.map(p=>`<button class="empty-kit-option" type="button" data-product="${p.id}" aria-label="Escolher kit de ${p.units} salgados por ${money(p.price)}"><img src="${p.image}" alt=""><span><b>${p.units} salgados</b><small>${money(p.price)}</small></span><span class="empty-kit-arrow">→</span></button>`).join('')}</div>
      <p class="empty-start-hint">Escolha um kit para iniciar a etapa 1 de 7. Nenhum pedido foi adicionado ainda.</p>
    </section>`;
  }
  function renderFlavors(){
    const p=pendingProduct;
    const modes=[
      {id:'mixed',emoji:'🎉',title:'Tudo misto',desc:'Um pouco de cada surpresa.'},
      {id:'single',emoji:'❤️',title:'Um sabor só',desc:'Todo o kit do seu favorito.'},
      {id:'custom',emoji:'✨',title:'Meu próprio mix',desc:'Você decide cada unidade.'}
    ];
    let html=`<div class="kit-intro"><img src="${p.image}" alt=""><div><small>VOCÊ ESTÁ MONTANDO</small><strong>Kit ${p.units} salgados</strong><span>${p.units} unidades para saborear</span><b>${money(p.price)}</b></div></div>`;
    if(upgradeNotice)html+=`<div class="upgrade-success" role="status"><span>✦</span> ${escapeHtml(upgradeNotice)}</div>`;
    html+=`<div class="mini-heading mode-question">Como você prefere seu kit? <span>Escolha o seu estilo de sabor</span></div><div class="flavor-option-grid">${modes.map(m=>`<button type="button" class="flavor-mode mode-${m.id} ${tempMix.mode===m.id?'active':''}" data-action="set-flavor-mode" data-value="${m.id}" aria-pressed="${tempMix.mode===m.id}"><span class="option-emoji" aria-hidden="true">${m.emoji}</span><strong>${m.title}</strong><small>${m.desc}</small><span class="mode-selected" aria-hidden="true">✓</span></button>`).join('')}</div>`;
    html+=`<div class="flavor-dynamic selection-animated" aria-live="polite">`;
    if(tempMix.mode==='mixed')html+=`<div class="surprise-note"><div class="surprise-symbol" aria-hidden="true">✦</div><div><div class="surprise-eyebrow">MISTURA DA CASA · WALTER SALGADOS</div><h3>Deixa o Walter <em>surpreender você!</em></h3><p>Um kit cheio de possibilidades: <b>${p.units} salgadinhos sortidos</b>, escolhidos para deixar cada mordida mais gostosa.</p><div class="surprise-foot"><span>✳</span> Os sabores do sortido dependem da disponibilidade e serão confirmados pelo Walter.</div></div></div>`;
    if(tempMix.mode==='single'){
      const selected=Object.keys(tempMix.flavors)[0]||'';
      html+=`<h3 class="mini-heading">Seu favorito, do primeiro ao último 💛</h3><div class="flavor-list glass-flavors">${FLAVORS.map(x=>`<button type="button" class="flavor-tile ${selected===x.id?'active':''}" data-action="single-flavor" data-value="${x.id}" aria-pressed="${selected===x.id}"><span class="flavor-icon">${x.icon}</span><span>${x.name}</span><b class="tile-check">✓</b></button>`).join('')}</div><p class="flavor-help">Seu kit inteiro terá <b>${p.units} unidades</b> do sabor escolhido, sujeito à confirmação da disponibilidade.</p>`;
    }
    if(tempMix.mode==='custom'){
      const ids=Object.keys(tempMix.flavors).filter(x=>getFlavor(x));
      const total=ids.reduce((s,id)=>s+tempMix.flavors[id],0);
      const remaining=p.units-total;
      html+=`<h3 class="mini-heading">Sua combinação favorita começa aqui ✨</h3><div class="flavor-list glass-flavors">${FLAVORS.map(x=>`<button type="button" class="flavor-tile ${ids.includes(x.id)?'active':''}" data-action="toggle-flavor" data-value="${x.id}" aria-pressed="${ids.includes(x.id)}"><span class="flavor-icon">${x.icon}</span><span>${x.name}</span><b class="tile-check">✓</b></button>`).join('')}</div><p class="flavor-help">Escolha os sabores; depois aumente ou diminua as unidades. <b>O resto do kit se ajusta sozinho.</b></p>`;
      if(ids.length)html+=`<div class="allocation-card glass-allocation"><div class="allocation-heading"><div><strong>Divida suas ${p.units} unidades</strong><small>Mais de um sabor? A gente equilibra pra você.</small></div><button type="button" data-action="distribute">Dividir igualmente</button></div>${ids.map(id=>`<div class="allocation-row"><span class="flavor-icon">${getFlavor(id).icon}</span><span class="allocation-row-name">${getFlavor(id).name}</span><div class="stepper"><button type="button" data-action="flavor-adjust" data-value="${id}" data-delta="-1" aria-label="Diminuir ${getFlavor(id).name}" ${ids.length===1||tempMix.flavors[id]===0?'disabled':''}>−</button><input type="number" inputmode="numeric" min="0" max="${p.units}" value="${tempMix.flavors[id]}" data-flavor-number="${id}" aria-label="Quantidade de ${getFlavor(id).name}"><button type="button" data-action="flavor-adjust" data-value="${id}" data-delta="1" aria-label="Aumentar ${getFlavor(id).name}" ${ids.length===1||tempMix.flavors[id]===p.units?'disabled':''}>+</button></div></div>`).join('')}</div><div class="remaining-meter mix-glass ${remaining===0?'':'warning'}" role="status" aria-live="polite"><span>${remaining===0?'✓ Kit perfeito! Todas as unidades distribuídas':remaining>0?`Faltam ${remaining} unidades`:`Passou ${-remaining} unidades`}</span><span>${total}/${p.units}</span></div><div class="mix-tip">💡 Quer mais coxinhas? É só aumentar. Os outros sabores diminuem automaticamente, sem perder nenhuma unidade.</div>`;
    }
    html+=`</div>`;
    const next=PRODUCTS.find(x=>x.units>p.units);
    if(next){
      const extra=next.units-p.units;
      html+=`<div class="upgrade-panel"><div class="upgrade-kicker">✦ MAIS SABOR, MAIS FESTA ✦</div><div class="upgrade-copy"><div class="upgrade-icon">🚀</div><div><strong>A fome pediu mais?</strong><p>Não fique só nas ${p.units} unidades. Faça um upgrade sem perder seu mix!</p></div></div><button type="button" class="upgrade-button" data-action="upgrade-kit" aria-label="Aumentar para ${next.units} salgados por mais ${money(next.price-p.price)}"><span class="upgrade-button-main"><span class="upgrade-bolt">✦</span> QUERO ${next.units} SALGADOS <span class="upgrade-bolt">✦</span></span><span class="upgrade-button-detail">+${extra} unidades por apenas +${money(next.price-p.price)} <span aria-hidden="true">↗</span></span></button></div>`;
    }else html+=`<div class="upgrade-limit upgrade-celebration"><span aria-hidden="true">🏆</span><div><small>VOCÊ CHEGOU AO TOPO!</small><strong>100 salgados. Uma escolha gigante!</strong><p>A festa cresceu? Na próxima etapa você pode montar outro kit e deixar todo mundo feliz.</p></div><span aria-hidden="true" class="upgrade-stars">✦ ✦</span></div>`;
    html+=`<div class="selection-note">💛 <b>Importante:</b> os sabores exibidos são sugestões para compor sua solicitação. O Walter confirma quais estão disponíveis no dia do pedido.</div>`;
    return html;
  }
  function renderCart(){
    const list=state.items.length?`<div class="cart-list">${state.items.map(item=>{const p=getProduct(item.productId);return `<article class="cart-item"><img src="${p.image}" alt=""><div class="cart-item-main"><div class="cart-item-title">Kit ${p.units} salgados</div><div class="cart-item-desc">${escapeHtml(mixText(item))}</div><div class="cart-item-meta"><strong>${money(p.price)}</strong><span class="tiny-muted">${p.units} unidades</span></div><div class="cart-item-actions"><button type="button" data-action="edit-item" data-value="${item.id}">Editar sabores</button><button type="button" data-action="remove-item" data-value="${item.id}">Remover</button></div></div></article>`;}).join('')}</div><div class="cart-total-box"><span>${state.items.length} ${state.items.length===1?'kit':'kits'} · ${totalUnits()} salgados</span><strong>${money(itemTotal())}</strong></div>`:`<div class="empty-message"><span>🥟</span><strong>Sua bandeja ainda está vazia</strong><p>Escolha um kit para começar a personalizar seu pedido.</p></div>`;
    return `${list}<h3 class="upsell-title">Que tal mais um pouco de sabor?</h3><p class="upsell-lead">Monte outra bandeja para compartilhar — ou siga com o que já escolheu. Sem pressa, o pedido é seu!</p><div class="add-kit-grid">${PRODUCTS.map(p=>`<button type="button" data-product="${p.id}" class="add-kit-mini"><img src="${p.image}" alt=""><strong>${p.units} un.</strong><span>${money(p.price)}</span></button>`).join('')}</div>`;
  }
  function renderCustomer(){return `<div class="form-grid"><div class="field full"><label for="f-name">Seu nome <span class="req">*</span></label><input id="f-name" type="text" autocomplete="name" maxlength="90" placeholder="Como podemos te chamar?" data-field="name" value="${escapeHtml(state.customer.name)}"></div><div class="field full"><label for="f-phone">Seu WhatsApp com DDD <span class="req">*</span></label><input id="f-phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="20" placeholder="(00) 00000-0000" data-field="phone" value="${escapeHtml(state.customer.phone)}"><small>Para o Walter confirmar o pedido e, se necessário, avisar quando estiver pronto.</small></div></div><div class="context-card"><svg class="icon"><use href="#i-shield"/></svg><p>Sem pagamento no site. Com o registro oficial ativado, seus dados do pedido também são gravados para controle e atendimento pelo Walter. O envio da mensagem no WhatsApp depende de você.</p></div>`;}
  function renderMethod(){
    const options=[
      {id:'pickup',emoji:'🛍️',title:'Vou buscar',eyebrow:'RÁPIDO E PRÁTICO',description:'Você escolhe o horário. O Walter confirma quando fica pronto.'},
      {id:'onsite',emoji:'🍽️',title:'Quero comer no local',eyebrow:'CURTIR NA HORA',description:'Conte quantas pessoas vêm. Sujeito a atendimento disponível.'}
    ];
    return `<div class="method-hero"><span>✦</span><div><strong>Seu momento, suas regras.</strong><p>Retire sua encomenda ou aproveite os salgados aqui no Walter. Você escolhe!</p></div></div><div class="method-grid method-grid-v13">${options.map(o=>`<button type="button" class="method-card method-${o.id} ${state.method===o.id?'active':''}" aria-pressed="${state.method===o.id}" data-action="method" data-value="${o.id}"><span class="method-icon" aria-hidden="true">${o.emoji}</span><span class="method-eyebrow">${o.eyebrow}</span><strong>${o.title}</strong><small>${o.description}</small><span class="method-check" aria-hidden="true">✓ Selecionado</span></button>`).join('')}</div><p class="hint-label glass-hint">✨ O Walter confirma o horário de retirada ou a disponibilidade para consumo no local.</p>`;
  }
  function renderSchedule(){
    const isOnsite=state.method==='onsite',scheduled=state.scheduleMode==='scheduled';
    const context=isOnsite?'da sua chegada':'da retirada';
    const today=localToday(),tomorrow=localTomorrow();
    let html=`<div class="schedule-welcome"><span class="welcome-emoji">${isOnsite?'🍽️':'🛍️'}</span><div><small>${isOnsite?'CONSUMO NO LOCAL SOB CONSULTA':'RETIRADA COMBINADA'}</small><strong>${isOnsite?'Tudo pronto para sua visita?':'Passou, pegou, aproveitou!'}</strong><p>Você nos diz como prefere. O Walter confirma disponibilidade e horário.</p></div></div>`;
    html+=`<h3 class="subsection-title schedule-section-title">🗓️ Quando deseja receber?</h3><div class="schedule-choice schedule-glass"><button type="button" data-action="schedule-mode" data-value="scheduled" class="schedule-mode-scheduled ${scheduled?'active':''}" aria-pressed="${scheduled}"><span class="schedule-symbol">🕒</span><strong>Quero horário marcado</strong><small>Escolho um horário para ${context}.</small></button><button type="button" data-action="schedule-mode" data-value="notify" class="schedule-mode-notify ${!scheduled?'active':''}" aria-pressed="${!scheduled}"><span class="schedule-symbol schedule-whatsapp" aria-hidden="true"><svg class="icon"><use href="#i-whatsapp"/></svg></span><strong>Me avise quando estiver pronto</strong><small>Prefiro combinar o horário pelo WhatsApp.</small></button></div>`;
    html+=`<div class="date-panel glass-pane"><div class="date-panel-top"><strong>📅 Escolha o dia</strong><div class="date-shortcuts"><button type="button" data-action="pick-date" data-value="today" class="${state.date===today?'active':''}">⚡ Hoje</button><button type="button" data-action="pick-date" data-value="tomorrow" class="${state.date===tomorrow?'active':''}">Amanhã</button></div></div><div class="form-grid"><div class="field"><label for="f-date">Data desejada <span class="req">*</span></label><input id="f-date" type="date" min="${today}" data-field="date" value="${escapeHtml(state.date)}"></div>${scheduled?`<div class="field time-field"><label for="f-time">Horário desejado <span class="req">*</span></label><div class="time-input-wrap"><span aria-hidden="true">◷</span><input id="f-time" type="time" data-field="time" value="${escapeHtml(state.time)}"></div></div>`:''}</div><p class="small-help">${scheduled?'Esse é o horário que você deseja. Sujeito à confirmação do Walter.':'O Walter poderá confirmar pelo WhatsApp quando seu pedido estiver pronto.'}</p></div>`;
    if(isOnsite){
      const people=Number(state.people)||2;
      html+=`<h3 class="subsection-title">👥 Quantas pessoas vêm?</h3><div class="people-panel glass-pane"><div class="people-count"><span>Vamos preparar sua chegada</span><div class="stepper people-stepper"><button type="button" data-action="people-adjust" data-delta="-1" ${people<=1?'disabled':''} aria-label="Diminuir número de pessoas">−</button><b>${people}</b><button type="button" data-action="people-adjust" data-delta="1" ${people>=50?'disabled':''} aria-label="Aumentar número de pessoas">+</button></div></div><div class="people-pills">${[1,2,3,4,5,6].map(n=>`<button type="button" data-action="people-select" data-value="${n}" class="${people===n?'active':''}">${n} ${n===1?'pessoa':'pessoas'}</button>`).join('')}</div><small>Consumo no local e disponibilidade de mesas devem ser confirmados pelo Walter.</small></div><div class="onsite-extra glass-pane"><span>🍋</span><div><strong>Gelo e limão para acompanhar?</strong><p>Podemos solicitar um copo para sua chegada (disponibilidade e eventual custo a confirmar).</p><div class="onsite-pills"><button type="button" data-action="ice-lemon" data-value="yes" class="${state.iceLemon?'active':''}">🍋 Sim, quero</button><button type="button" data-action="ice-lemon" data-value="no" class="${!state.iceLemon?'active':''}">Não precisa</button></div></div></div>`;
    }else html+=`<div class="context-card glass-hint"><svg class="icon"><use href="#i-clock"/></svg><p>Walter confirmará se consegue deixar os salgados prontos no horário escolhido. ${config.enderecoRetirada?`Endereço de retirada: ${escapeHtml(config.enderecoRetirada)}.`:'O endereço da retirada será combinado pelo WhatsApp.'}</p></div>`;
    html+=`<h3 class="subsection-title">✨ Capricho do seu jeito</h3><div class="prep-options"><button type="button" data-action="prep-mode" data-value="frito na hora, se possível" class="${state.prep==='frito na hora, se possível'?'active':''}"><span class="prep-emoji">🔥</span><strong>Quero bem fresquinho</strong><small>Se possível, fritar próximo do meu horário.</small></button><button type="button" data-action="prep-mode" data-value="preparo a critério do Walter" class="${state.prep==='preparo a critério do Walter'?'active':''}"><span class="prep-emoji">💛</span><strong>Pode preparar da melhor forma</strong><small>O Walter organiza o preparo.</small></button></div><div class="field notes-field"><label for="f-notes">📝 Tem algum recadinho? (opcional)</label><textarea id="f-notes" data-field="notes" maxlength="450" placeholder="Algum detalhe que vai deixar seu pedido ainda melhor?">${escapeHtml(state.notes)}</textarea></div>`;
    return html;
  }
  function renderDrinks(){
    let html=`<div class="drink-banner"><span>🧊</span><div><strong>Uma bebida bem geladinha?</strong><p>Escolha o que gostaria de pedir. Marcas, embalagens e preços precisam ser confirmados com Walter.</p></div></div><div class="drink-list">${DRINKS.map(d=>{const qty=state.drinks[d.id]||0;const price=drinkPrice(d.id);return `<div class="drink-row"><span class="drink-icon">${d.icon}</span><div class="drink-info"><strong>${d.name}</strong><small>${d.size} • sujeito à disponibilidade</small><b>${price===null?'Preço a confirmar':money(price)}</b></div><div class="stepper"><button type="button" aria-label="Diminuir ${d.name}" data-action="drink-adjust" data-value="${d.id}" data-delta="-1" ${qty===0?'disabled':''}>−</button><span>${qty}</span><button type="button" aria-label="Adicionar ${d.name}" data-action="drink-adjust" data-value="${d.id}" data-delta="1" ${qty>=99?'disabled':''}>+</button></div></div>`}).join('')}</div>`;
    if(state.method==='onsite')html+=`<div class="drink-extras"><label class="check-line"><input type="checkbox" data-check="iceLemon" ${state.iceLemon?'checked':''}><span><strong>🍋 Quero copo com gelo e limão</strong><small>Se possível, deixar preparado para quando eu chegar. Sujeito à disponibilidade.</small></span></label></div>`;
    else html+=`<div class="drink-extras"><label class="check-line"><input type="checkbox" data-check="drinkCold" ${state.drinkCold?'checked':''}><span><strong>❄️ Quero minhas bebidas bem geladas</strong><small>Para levar e aproveitar em casa, se possível.</small></span></label></div>`;
    html+=`<p class="flavor-help">Não quer bebida? Sem problema! Pode simplesmente continuar. Nenhum produto extra será cobrado sem confirmação do preço.</p>`;
    return html;
  }
  function methodLabel(){return {pickup:'Retirada no local',onsite:'Consumo no local'}[state.method];}
  function scheduleLabel(){return state.scheduleMode==='notify'?`${formattedDate(state.date)} · Avisar quando estiver pronto`:`${formattedDate(state.date)} às ${state.time||'a combinar'}`;}
  function renderReview(){
    const drinks=DRINKS.filter(d=>state.drinks[d.id]>0), unknown=unknownDrinks();
    const itemCards=state.items.map((it,i)=>{const p=getProduct(it.productId);return `<div class="receipt-item"><div class="receipt-item-icon">🥟</div><div><strong>Kit ${p.units} salgados</strong><small>${escapeHtml(mixText(it))}</small></div><b>${money(p.price)}</b></div>`}).join('');
    let html=`<div class="receipt-celebration"><span class="celebration-icon">✦</span><small>100% DO SEU PEDIDO MONTADO</small><strong>Vamos registrar sua solicitação!</strong><p>Sua comanda está organizada. O envio pelo WhatsApp ainda precisa da sua confirmação.</p><span class="receipt-confetti" aria-hidden="true">✦ ✳ ✦ ✳</span></div>`;
    html+=`<section class="receipt-paper"><div class="receipt-paper-head"><div><small>COMANDA DIGITAL</small><strong>Walter Salgados</strong><span>🥟 Seu momento mais gostoso</span></div><span class="receipt-status">AGUARDANDO CONFIRMAÇÃO</span></div>${orderRef?`<div class="order-reference ${orderRef.source==='local'?'is-demo':''}"><strong>${orderRef.source==='server'?'SOLICITAÇÃO REGISTRADA':'PRÉVIA LOCAL — SEM REGISTRO GLOBAL'}</strong><span>${formattedOrderRef(orderRef)}</span></div>`:`<div class="order-reference"><strong>COMANDA PARA WHATSAPP</strong><span>O Walter confirma o pedido por mensagem.</span></div>`}<div class="receipt-body"><div class="receipt-label"><span>01 · SEUS SALGADOS</span><button type="button" data-action="edit-step" data-value="cart">Editar</button></div>${itemCards}<div class="receipt-label"><span>02 · SEUS DADOS</span><button type="button" data-action="edit-step" data-value="customer">Editar</button></div><div class="receipt-line"><span>Nome</span><b>${escapeHtml(state.customer.name)}</b></div><div class="receipt-line"><span>WhatsApp</span><b>${escapeHtml(state.customer.phone)}</b></div><div class="receipt-label"><span>03 · RECEBIMENTO</span><button type="button" data-action="edit-step" data-value="method">Editar</button></div><div class="receipt-line"><span>Como receber</span><b>${methodLabel()}</b></div><div class="receipt-line"><span>Quando</span><b>${scheduleLabel()}</b></div>${state.method==='onsite'?`<div class="receipt-line"><span>Pessoas</span><b>${Number(state.people)||2}</b></div>${state.iceLemon?`<div class="receipt-line"><span>Extra solicitado</span><b>🍋 Copo com gelo e limão</b></div>`:''}`:''}<div class="receipt-line"><span>Preparo</span><b>${escapeHtml(state.prep)}</b></div>${state.notes?`<div class="receipt-line"><span>Observações</span><b>${escapeHtml(state.notes)}</b></div>`:''}<div class="receipt-label"><span>04 · BEBIDAS & EXTRAS</span><button type="button" data-action="edit-step" data-value="drinks">Editar</button></div>${drinks.length?drinks.map(d=>`<div class="receipt-line"><span>${state.drinks[d.id]}× ${d.name}</span><b>${drinkPrice(d.id)===null?'Valor a confirmar':money(drinkPrice(d.id)*state.drinks[d.id])}</b></div>`).join(''):`<p class="receipt-empty">Nenhuma bebida adicionada.</p>`}</div><div class="receipt-price"><div><span>Salgados</span><b>${money(itemTotal())}</b></div>${drinks.length?`<div><span>Bebidas com preço informado</span><b>${money(drinkTotal())}</b></div>`:''}<div class="receipt-price-total"><span>Subtotal conhecido</span><strong>${money(subtotal())}</strong></div><small>${unknown?'Bebidas com preços a confirmar. ':''}Preço final, sabores e disponibilidade serão confirmados pelo Walter. Nenhum pagamento é cobrado aqui.</small></div></section>`;
    html+=`<button class="preview-toggle receipt-preview" type="button" data-action="toggle-preview">${showPreview?'Ocultar':'Visualizar'} texto da comanda <svg class="icon"><use href="#i-chevron"/></svg></button>${showPreview?`<div class="comanda-preview">${escapeHtml(buildMessage())}</div>`:''}`;
    html+=`<div class="send-panel send-panel-v13 ${hasWhatsApp()?'':'warning'}"><span>💬</span><div><strong>${hasWhatsApp()?'WhatsApp configurado para receber a comanda':'Falta conectar o WhatsApp comercial'}</strong><p>${hasWhatsApp()?'Ao continuar, a comanda abre no WhatsApp. Você precisa pressionar Enviar lá. O Walter confirma o pedido por mensagem.':'O botão de envio já está preparado. Configure o número real do Walter em config.js para ativá-lo. Você ainda pode visualizar ou copiar a comanda para testes.'}</p></div></div>${config.whatsappNeedsConfirmation?'<p class="number-verify">⚠️ Número informado com 8 dígitos após o DDD. Confirme se falta o 9 antes de publicar.</p>':''}<button type="button" class="receipt-copy" data-action="copy-order"><svg class="icon"><use href="#i-copy"/></svg> Copiar texto da comanda (opcional)</button>`;
    return html;
  }
  function buildMessage(){
    const items=state.items.map((x,i)=>{const p=getProduct(x.productId);let line=`*Kit ${i+1}: ${p.units} salgados — ${money(p.price)}*\n`;if(x.mode==='mixed')line+=`• Sortido / misto — combinação a confirmar pelo Walter`;else line+=Object.entries(x.flavors||{}).filter(([k,n])=>getFlavor(k)&&n>0).map(([k,n])=>`• ${n}× ${getFlavor(k).name}`).join('\n');return line;}).join('\n\n');
    const drinks=DRINKS.filter(d=>state.drinks[d.id]>0);
    const drinksLines=drinks.length?drinks.map(d=>`• ${state.drinks[d.id]}× ${d.name} (${d.size}) — ${drinkPrice(d.id)===null?'preço e disponibilidade a confirmar':money(state.drinks[d.id]*drinkPrice(d.id))}`).join('\n'):'Nenhuma';
    let when=`Data desejada: ${formattedDate(state.date)}\n`+(state.scheduleMode==='scheduled'?`Horário desejado: ${state.time}`:'Prefiro aviso/combinar horário quando estiver pronto');
    let address='';if(state.method==='onsite')address=`\nConsumo no local: sujeito à confirmação\nPessoas: ${Number(state.people)||2}`;
    const drinkExtras=state.method==='onsite'?(state.iceLemon?'\n• Solicito copo com gelo e limão na chegada, se possível. Disponibilidade/custo a confirmar.':''):drinks.length?(state.drinkCold?'\n• Gostaria das bebidas bem geladas, se possível':'\n• Sem preferência de temperatura'):'';
    const finalNotes=state.notes.trim()||'Nenhuma';
    return `🥟 *NOVA COMANDA — WALTER SALGADOS*\n*SOLICITAÇÃO — AGUARDANDO CONFIRMAÇÃO*\n${orderRef?(orderRef.source==='server'?`*PEDIDO ${orderRef.number} — ${formattedDate(orderRef.day)}*`:`*TESTE LOCAL — ${orderRef.number} (${formattedDate(orderRef.day)}), NÃO É NUMERAÇÃO GERAL*`):'*Solicitação pelo WhatsApp — confirmação pendente*'}\n\n`+
      `🧾 *SALGADOS*\n${items}\n\n📦 *Total de salgados:* ${totalUnits()} unidades (${state.items.length} ${state.items.length===1?'kit':'kits'})\n`+
      `🥤 *BEBIDAS*\n${drinksLines}${drinkExtras}\n\n`+
      `👤 *CLIENTE*\nNome: ${state.customer.name.trim()}\nWhatsApp: ${state.customer.phone.trim()}\n\n`+
      `📅 *COMO RECEBER*\n${methodLabel()}\n${when}${address}\nPreferência de preparo: ${state.prep}\n\n`+
      `📝 *OBSERVAÇÕES:* ${finalNotes}\n\n`+
      `💰 *Subtotal dos salgados:* ${money(itemTotal())}\n`+
      `${drinks.length?`*Bebidas:* ${unknownDrinks()?'Há itens com preços a confirmar':money(drinkTotal())}\n`:''}`+
      `*Subtotal com preços informados:* ${money(subtotal())}\n`+
      `${unknownDrinks()?'⚠️ Bebidas com preço a confirmar podem alterar o valor final.\n':''}`+
      `\n✅ *Por favor, confirme sabores disponíveis, preços finais, forma de recebimento e horário. O pedido ainda não está confirmado.*`;
  }
  function shareLocation(){
    if(!navigator.geolocation){toast('Localização indisponível. Cole um link do Google Maps no campo abaixo.');return;}
    if(!window.isSecureContext){toast('Para permitir localização, abra o site via HTTPS. Ou cole um link do Google Maps.');return;}
    if(geoPending)return;
    geoPending=true;toast('Seu navegador vai pedir permissão para acessar a localização.');
    navigator.geolocation.getCurrentPosition(pos=>{
      geoPending=false;
      const {latitude,longitude}=pos.coords;
      state.mapLink=`https://www.google.com/maps?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
      renderStep(true);toast('Localização adicionada! Ela só será enviada se você confirmar a comanda.');
    },()=>{geoPending=false;toast('Não foi possível obter a localização. Cole o link do Google Maps ou preencha o endereço.');},
    {enableHighAccuracy:false,timeout:12000,maximumAge:60000});
  }
  function safeMapUrl(s){try{const u=new URL(String(s||'').trim());return u.protocol==='https:' && /(^(maps\.app\.goo\.gl|goo\.gl)$|(^|\.)google\.com(\.br)?$)/.test(u.hostname.toLowerCase())?u.href:'';}catch(e){return '';}}
  function validStep(){
    if(step==='cart' && !state.items.length){toast('Escolha pelo menos um kit para continuar.');return false;}
    if(step==='customer'){
      if(state.customer.name.trim().length<2){toast('Digite seu nome para continuar.');$('#f-name')?.focus();return false;}
      const digits=state.customer.phone.replace(/\D/g,'');if(digits.length<10||digits.length>13){toast('Informe seu WhatsApp com DDD.');$('#f-phone')?.focus();return false;}
    }
    if(step==='schedule'){
      if(!state.date || state.date<localToday()){toast('Escolha uma data válida para o pedido.');$('#f-date')?.focus();return false;}
      if(state.scheduleMode==='scheduled' && !state.time){toast('Informe o horário desejado.');$('#f-time')?.focus();return false;}
      if(state.scheduleMode==='scheduled' && state.date===localToday()){
        const now=new Date(),minutes=now.getHours()*60+now.getMinutes();const [h,m]=state.time.split(':').map(Number);
        if(h*60+m<=minutes){toast('Escolha um horário futuro ou a opção de aviso.');$('#f-time')?.focus();return false;}
      }
    }
    return true;
  }
  function nextStep(){if(!validStep())return;const index=ORDER.indexOf(step);if(index<ORDER.length-1)goto(ORDER[index+1]);}
  function backStep(){if(step==='start'){closeModal();return;}if(step==='flavors'){if(editingId!==null)goto('cart');else if(kitEntrySource==='start')goto('start');else if(kitEntrySource==='cart')goto('cart');else closeModal();return;}if(step==='cart'){closeModal();return;}if(step==='review'){goto(reviewOrigin);return;}goto(ORDER[ORDER.indexOf(step)-1]);}
  // A brief, non-blocking shockwave highlights the selected action after a rerender.
  // CSS respects prefers-reduced-motion. No timers or layout measurements needed.
  function highlightSelection(action,value){
    requestAnimationFrame(()=>{
      const matches=[...document.querySelectorAll('[data-action]')];
      const chosen=matches.find(el=>el.dataset.action===action && el.dataset.value===value);
      if(chosen){chosen.classList.remove('just-selected');void chosen.offsetWidth;chosen.classList.add('just-selected');}
    });
  }
  function handleAction(action,target){
    const v=target.dataset.value;
    if(action==='back'){backStep();return;}
    if(action==='next'){nextStep();return;}
    if(action==='commit-kit'){commitKit();return;}
    if(action==='set-flavor-mode'){
      if(tempMix.mode===v)return;
      tempMix.mode=v;
      tempMix.flavors={};
      renderStep(true);highlightSelection('set-flavor-mode',v);return;
    }
    if(action==='single-flavor'){tempMix.flavors={[v]:pendingProduct.units};renderStep(true);highlightSelection('single-flavor',v);return;}
    if(action==='browse-kits'){closeModal();$('#cardapio').scrollIntoView({behavior:'smooth'});return;}
    if(action==='toggle-flavor'){
      if(Object.hasOwn(tempMix.flavors,v))delete tempMix.flavors[v];else tempMix.flavors[v]=0;
      normalizeCustom();renderStep(true);highlightSelection('toggle-flavor',v);return;
    }
    if(action==='distribute'){normalizeCustom();renderStep(true);highlightSelection('distribute',v);return;}
    if(action==='flavor-adjust'){adjustMixFlavor(v,(tempMix.flavors[v]||0)+Number(target.dataset.delta));updateAllocationUI();return;}
    if(action==='upgrade-kit'){upgradeKit();return;}
    if(action==='edit-item'){const x=state.items.find(i=>i.id===Number(v));if(x)selectKit(x.productId,x.id);return;}
    if(action==='remove-item'){invalidateOrderReference();state.items=state.items.filter(i=>i.id!==Number(v));if(!state.items.length)state.drinks={};save();renderHeader();goto(state.items.length?'cart':'start');toast(state.items.length?'Kit removido.':'Carrinho zerado. Escolha seu primeiro kit!');return;}
    if(action==='method'){if(!['pickup','onsite'].includes(v))return;invalidateOrderReference();state.method=v;renderStep(true);highlightSelection('method',v);return;}
    if(action==='schedule-mode'){invalidateOrderReference();state.scheduleMode=v;renderStep(true);highlightSelection('schedule-mode',v);return;}
    if(action==='pick-date'){invalidateOrderReference();state.date=v==='today'?localToday():localTomorrow();renderStep(true);highlightSelection('pick-date',v);return;}
    if(action==='prep-mode'){invalidateOrderReference();state.prep=v;renderStep(true);highlightSelection('prep-mode',v);return;}
    if(action==='people-adjust'){invalidateOrderReference();state.people=String(Math.max(1,Math.min(50,(Number(state.people)||1)+Number(target.dataset.delta))));renderStep(true);return;}
    if(action==='people-select'){invalidateOrderReference();state.people=v;renderStep(true);highlightSelection('people-select',v);return;}
    if(action==='ice-lemon'){invalidateOrderReference();state.iceLemon=v==='yes';renderStep(true);highlightSelection('ice-lemon',v);return;}
    if(action==='share-location'){shareLocation();return;}
    if(action==='open-maps'){window.open('https://www.google.com/maps','_blank','noopener,noreferrer');return;}
    if(action==='skip-drinks'){if(validStep())goto('review');return;}
    if(action==='drink-adjust'){invalidateOrderReference();state.drinks[v]=Math.max(0,Math.min(99,(state.drinks[v]||0)+Number(target.dataset.delta)));save();renderHeader();renderStep(true);return;}
    if(action==='edit-step'){if(orderRef)toast('Alterações nesta comanda exigem um novo número de solicitação.');goto(v);return;}
    if(action==='toggle-preview'){showPreview=!showPreview;const pos=$('#modal-scroll').scrollTop;$('#modal-content').innerHTML=renderReview();$('#modal-scroll').scrollTop=pos;return;}
    if(action==='copy-order'){copyOrder();return;}
    if(action==='send-order'){sendOrder();return;}
  }
  async function copyOrder(){const msg=buildMessage();let success=false;try{await navigator.clipboard.writeText(msg);success=true;}catch(e){}
    if(!success){const ta=document.createElement('textarea');ta.value=msg;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{success=document.execCommand('copy');}catch(e){}ta.remove();}
    if(success)toast('Comanda copiada! Pronta para compartilhar.');else {showPreview=true;$('#modal-content').innerHTML=renderReview();toast('Selecione e copie o texto exibido na comanda.');}
  }

  function nextDemoReference(){
    const day=spDate(),key='walter-v20-demo-sequence';
    let previous=null;
    try{previous=JSON.parse(localStorage.getItem(key)||'null');}catch(_){}
    let n=previous&&previous.day===day?Number(previous.number)||0:demoSequenceMemory;
    n++;
    try{localStorage.setItem(key,JSON.stringify({day,number:n}));}catch(_){}
    demoSequenceMemory=n;
    return {day,number:String(n).padStart(4,'0'),source:'local'};
  }
  function orderPayload(){
    return {requestId:orderRequestId,customer:{name:state.customer.name.trim(),phone:state.customer.phone.trim()},
      method:state.method,date:state.date,time:state.scheduleMode==='scheduled'?state.time:'',
      scheduleMode:state.scheduleMode,people:state.method==='onsite'?Number(state.people)||2:0,
      prep:state.prep,notes:state.notes,iceLemon:state.method==='onsite'&&state.iceLemon,
      items:state.items.map(x=>({productId:x.productId,mode:x.mode,flavors:x.flavors||{}})),
      drinks:DRINKS.filter(d=>state.drinks[d.id]>0).map(d=>({id:d.id,quantity:state.drinks[d.id]}))};
  }
  async function registerOrder(){
    if(orderRef)return orderRef;
    if(config.orderApiEnabled===true){
      if(location.protocol==='file:')throw new Error('API oficial precisa do site publicado por HTTPS.');
      const response=await fetch(config.orderApiUrl||'/api/orders',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(orderPayload()),credentials:'same-origin'
      });
      let result=null;try{result=await response.json();}catch(_){}
      if(!response.ok||!result||!/^\d{4,}$/.test(String(result.number))||!/^\d{4}-\d{2}-\d{2}$/.test(String(result.day)))
        throw new Error(result?.error||'O servidor não conseguiu registrar o pedido.');
      orderRef={day:result.day,number:String(result.number),source:'server'};
    }else{
      return null; // produção sem numeração local; ativar banco D1 para contagem real
    }
    return orderRef;
  }
  async function sendOrder(){
    if(orderSubmitting)return;
    if(!hasWhatsApp()){toast('Confirme o número comercial do Walter antes de abrir a comanda.');return;}
    if(!state.items.length||!state.customer.name.trim()||!state.customer.phone.trim()||!state.date){toast('Finalize os dados da comanda antes de continuar.');return;}
    // Open synchronously to avoid popup blockers after awaiting server/API.
    const popup=window.open('about:blank','_blank');
    if(popup) {try{popup.opener=null;popup.document.title='Preparando comanda Walter Salgados';popup.document.body.textContent='Preparando sua comanda...';}catch(_){}}
    orderSubmitting=true;
    const button=document.querySelector('[data-action="send-order"]');
    if(button){button.disabled=true;button.textContent='Abrindo WhatsApp...';}
    try{
      await registerOrder();
      const digits=String(config.whatsapp).replace(/\D/g,'');
      const url=`https://wa.me/${digits}?text=${encodeURIComponent(buildMessage())}`;
      if(popup){popup.location.href=url;}else window.location.assign(url);
      if(step==='review')renderStep(true);
      toast(orderRef?.source==='server'?'Solicitação registrada. Confirme o envio no WhatsApp.':'Confirme o envio da comanda no WhatsApp.');
    }catch(err){
      if(popup){try{popup.close();}catch(_){}}
      toast(`Não foi possível registrar: ${err?.message||'falha temporária'}`);
      if(step==='review')renderStep(true);
    }finally{orderSubmitting=false;const b=document.querySelector('[data-action="send-order"]');if(b)b.disabled=false;}
  }
  function initialize(){
    renderProducts();renderHeader();$('#year').textContent=new Date().getFullYear();
    document.addEventListener('click',e=>{
      const kit=e.target.closest('[data-product]');if(kit){selectKit(kit.dataset.product);return;}
      const action=e.target.closest('[data-action]');if(action){handleAction(action.dataset.action,action);return;}
      if(e.target.closest('#header-cart')||e.target.closest('#mobile-cart')){step=count()?'cart':'start';openModal();return;}
      if(e.target.closest('#experience-cta')||e.target.closest('#closing-start')){step=count()?'cart':'start';openModal();return;}
      if(e.target.closest('#modal-close')||e.target.id==='modal-overlay'){closeModal();return;}
    });
    document.addEventListener('input',e=>{
      const el=e.target;
      if(el.dataset.flavorNumber){adjustMixFlavor(el.dataset.flavorNumber,el.value);updateAllocationUI();return;}
      const field=el.dataset.field;
      if(field){invalidateOrderReference();if(field==='name'||field==='phone')state.customer[field]=el.value;else state[field]=el.value;return;}
      const check=el.dataset.check;if(check)state[check]=el.checked;
    });
    document.addEventListener('change',e=>{
      const el=e.target;if(el.dataset.flavorNumber){adjustMixFlavor(el.dataset.flavorNumber,el.value);updateAllocationUI();}
    });
    document.addEventListener('keydown',e=>{
      if($('#modal-overlay').hidden)return;
      if(e.key==='Escape'){closeModal();return;}
      if(e.key==='Tab'){
        const dialog=$('.order-modal');const targets=Array.from(dialog.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled)')).filter(x=>x.offsetParent!==null);
        if(!targets.length)return;const first=targets[0],last=targets[targets.length-1];if(e.shiftKey && (document.activeElement===first||document.activeElement===dialog)){e.preventDefault();last.focus();}
        else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}
      }
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize);else initialize();
})();


