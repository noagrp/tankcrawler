(() => {
  // Tank Crawler enhancement layer. Original drawing/audio routines remain in index.html.
  const wrapper = document.getElementById('gameWrapper');
  const shopGrid = document.querySelector('#shopScreen .shop-grid');

  // Mobile layout/control styles only; no game asset styles are replaced.
  const style = document.createElement('style');
  style.textContent = `
    html,body{min-height:100dvh}
    canvas{touch-action:none}
    .tc-pad{display:none;position:absolute;bottom:calc(env(safe-area-inset-bottom) + 72px);width:112px;height:112px;border-radius:50%;background:rgba(24,34,43,.38);border:1px solid rgba(255,255,255,.20);z-index:6;touch-action:none;overscroll-behavior:none}
    .tc-pad.move{left:14px}.tc-pad.aim{right:14px}
    .tc-stick{position:absolute;left:36px;top:36px;width:40px;height:40px;border-radius:50%;background:rgba(102,252,241,.68);box-shadow:0 0 12px rgba(102,252,241,.22);pointer-events:none}
    .tc-pad.aim .tc-stick{background:rgba(255,204,0,.68)}
    .tc-pad-label{position:absolute;left:0;right:0;bottom:7px;text-align:center;font-size:9px;font-weight:bold;color:#ddd;letter-spacing:1px;pointer-events:none}
    .shop-item.tc-repair{border-color:rgba(124,255,139,.45)}
    .shop-item.tc-repair button{background:#7cff8b}
    .shop-item button:disabled{opacity:.45;cursor:default;box-shadow:none}
    @media(max-width:640px),(pointer:coarse){
      .tc-pad{display:block}
      #instructions{display:none}
      #hud{padding:7px 10px}
      .stat{font-size:12px}
      #shopScreen{justify-content:flex-start;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding-top:18px;padding-bottom:calc(env(safe-area-inset-bottom) + 48px)}
      #shopScreen .shop-grid{flex:0 0 auto;width:100%}
      #shopScreen .close-shop-btn{flex:0 0 auto;margin-bottom:12px}
    }
    @media(max-height:740px) and (pointer:coarse){.tc-pad{bottom:calc(env(safe-area-inset-bottom) + 54px)}}
  `;
  document.head.appendChild(style);

  // PWA/browser wiring. Uses the existing repo icons/manifest/service worker only.
  const addLink=(rel,href,attrs={})=>{let el=document.querySelector(`link[rel="${rel}"]`);if(!el){el=document.createElement('link');el.rel=rel;document.head.appendChild(el)}el.href=href;Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));return el};
  addLink('manifest','./manifest.webmanifest');
  addLink('icon','./favicon-32x32.png',{type:'image/png',sizes:'32x32'});
  addLink('apple-touch-icon','./apple-touch-icon.png');
  let theme=document.querySelector('meta[name="theme-color"]');if(!theme){theme=document.createElement('meta');theme.name='theme-color';document.head.appendChild(theme)}theme.content='#06070a';
  let mobileCapable=document.querySelector('meta[name="apple-mobile-web-app-capable"]');if(!mobileCapable){mobileCapable=document.createElement('meta');mobileCapable.name='apple-mobile-web-app-capable';document.head.appendChild(mobileCapable)}mobileCapable.content='yes';
  if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));}

  // Show current/max hull without replacing the original hpVal element reference.
  const hpParent = hpVal.parentElement;
  Array.from(hpParent.childNodes).forEach(node => {
    if (node.nodeType === Node.TEXT_NODE && node.textContent.includes('%')) node.textContent = node.textContent.replace('%','');
  });
  const slash = document.createTextNode('/');
  const maxHpDisplay = document.createElement('span');
  maxHpDisplay.id = 'maxHpVal';
  maxHpDisplay.textContent = maxHp;
  hpVal.after(slash, maxHpDisplay);

  function syncHullHud(){
    hpVal.innerText = Math.floor(hp);
    maxHpDisplay.innerText = Math.floor(maxHp);
    scoreVal.innerText = score;
    shopBalanceVal.innerText = score + ' Sv';
  }

  resizeViewport = function(){
    const hudHeight = document.getElementById('hud').offsetHeight;
    const availableW = Math.max(240, window.innerWidth);
    const availableH = Math.max(240, window.innerHeight - hudHeight);
    TILE_SIZE = 56;
    const minWorld = TILE_SIZE * 12;
    const logicalScale = Math.max(1, minWorld / availableW, minWorld / availableH);
    canvas.style.width = availableW + 'px';
    canvas.style.height = availableH + 'px';
    canvas.width = Math.ceil(availableW * logicalScale);
    canvas.height = Math.ceil(availableH * logicalScale);
    COLS = Math.max(12, Math.floor(canvas.width / TILE_SIZE));
    ROWS = Math.max(12, Math.floor(canvas.height / TILE_SIZE));
  };

  function makePad(kind,label){
    const pad=document.createElement('div');
    pad.className='tc-pad '+kind;
    pad.innerHTML='<div class="tc-stick"></div><div class="tc-pad-label">'+label+'</div>';
    wrapper.appendChild(pad);
    return pad;
  }
  const movePad=makePad('move','MOVE');
  const aimPad=makePad('aim','AIM / FIRE');
  const touchKeys={up:false,down:false,left:false,right:false};
  function applyTouchKeys(){
    keys['KeyW']=touchKeys.up; keys['ArrowUp']=touchKeys.up;
    keys['KeyS']=touchKeys.down; keys['ArrowDown']=touchKeys.down;
    keys['KeyA']=touchKeys.left; keys['ArrowLeft']=touchKeys.left;
    keys['KeyD']=touchKeys.right; keys['ArrowRight']=touchKeys.right;
  }
  function setupPad(el,mode){
    const stick=el.querySelector('.tc-stick');
    let pointerId=null;
    const center=56,max=38;
    function reset(){
      stick.style.transform='';
      if(mode==='move'){
        touchKeys.up=touchKeys.down=touchKeys.left=touchKeys.right=false;
        applyTouchKeys();
      }else{
        isMouseDown=false;
      }
      pointerId=null;
    }
    function moveFromPointer(e){
      if(e.pointerId!==pointerId)return;
      const r=el.getBoundingClientRect();
      const x=e.clientX-r.left-center,y=e.clientY-r.top-center;
      const mag=Math.hypot(x,y),d=Math.min(max,mag),nx=mag?x/mag:0,ny=mag?y/mag:0;
      stick.style.transform=`translate(${nx*d}px,${ny*d}px)`;
      if(mode==='move'){
        const dead=.25;
        touchKeys.left=nx<-dead; touchKeys.right=nx>dead;
        touchKeys.up=ny<-dead; touchKeys.down=ny>dead;
        applyTouchKeys();
      }else{
        if(mag>6){
          turretAngle=Math.atan2(ny,nx);
          isMouseDown=true;
        }else{
          isMouseDown=false;
        }
      }
    }
    el.addEventListener('pointerdown',e=>{
      if(pointerId!==null)return;
      e.preventDefault();
      pointerId=e.pointerId;
      try{el.setPointerCapture(pointerId)}catch(_){}
      moveFromPointer(e);
    });
    el.addEventListener('pointermove',e=>{if(e.pointerId===pointerId){e.preventDefault();moveFromPointer(e)}});
    el.addEventListener('pointerup',e=>{
      if(e.pointerId!==pointerId)return;
      e.preventDefault();
      try{el.releasePointerCapture(pointerId)}catch(_){}
      reset();
    });
    el.addEventListener('pointercancel',e=>{if(e.pointerId===pointerId)reset()});
    el.addEventListener('lostpointercapture',e=>{if(e.pointerId===pointerId)reset()});
  }
  setupPad(movePad,'move'); setupPad(aimPad,'aim');

  let touchMusicStarted=false;
  window.addEventListener('touchstart',()=>{
    if(touchMusicStarted)return;touchMusicStarted=true;
    try{if(audioCtx.state==='suspended')audioCtx.resume();playSequence()}catch(e){}
  },{once:true,passive:true});

  function validFloorForEnemy(x,y,r){return !checkWallCollision(x,y,r)}
  function bestAdjacentFloor(enemy){
    const c=Math.floor(enemy.x/TILE_SIZE),r=Math.floor(enemy.y/TILE_SIZE);
    const options=[[1,0],[-1,0],[0,1],[0,-1]]
      .map(([dx,dy])=>({c:c+dx,r:r+dy}))
      .filter(p=>p.r>0&&p.c>0&&p.r<ROWS-1&&p.c<COLS-1&&grid[p.r]&&grid[p.r][p.c]===0)
      .map(p=>({x:p.c*TILE_SIZE+TILE_SIZE/2,y:p.r*TILE_SIZE+TILE_SIZE/2}))
      .filter(p=>validFloorForEnemy(p.x,p.y,enemy.radius));
    if(!options.length)return null;
    options.sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y));
    return options[0];
  }
  const originalEnemyUpdate=Enemy.prototype.update;
  Enemy.prototype.update=function(){
    const ox=this.x,oy=this.y;
    originalEnemyUpdate.call(this);
    if(!this.active)return;
    if(!validFloorForEnemy(this.x,this.y,this.radius)){
      const p=bestAdjacentFloor(this);
      if(p){this.x=p.x;this.y=p.y}
    }
    if(['DRONE','ROBO','CHASING_TANK'].includes(this.type)&&this.speed>0&&Math.hypot(player.x-this.x,player.y-this.y)<340){
      const moved=Math.hypot(this.x-ox,this.y-oy);
      this._tcStuck=moved<.12?(this._tcStuck||0)+1:0;
      if(this._tcStuck>50){
        const p=bestAdjacentFloor(this);
        if(p){this.x=p.x;this.y=p.y}
        if(this.type==='ROBO'){this.dirTimer=0;this.vx=0;this.vy=0}
        this._tcStuck=0;
      }
    }
  };

  // Preserve the original random spawning, but never allow an empty/super-sparse normal sector.
  const baseGenerateRogueMap=generateRogueMap;
  generateRogueMap=function(){
    baseGenerateRogueMap();
    if(mapDepth%5===0)return;
    const combatEnemies=()=>enemies.filter(e=>e.active&&e.type!=='ROCK_BALL').length;
    const minimumCombat=4;
    if(combatEnemies()>=minimumCombat)return;
    const pool=['DRONE','ROBO','SHOOTING_TANK','CHASING_TANK','FLAME_TANK','TESLA_PYLON','VIPER_TOWER'];
    const spots=[];
    for(let r=1;r<ROWS-1;r++)for(let c=1;c<COLS-1;c++){
      if(!grid[r]||grid[r][c]!==0)continue;
      const x=c*TILE_SIZE+TILE_SIZE/2,y=r*TILE_SIZE+TILE_SIZE/2;
      if(Math.hypot(x-player.x,y-player.y)<TILE_SIZE*2.4)continue;
      if(Math.hypot(x-exitPortal.x,y-exitPortal.y)<TILE_SIZE*1.7)continue;
      if(enemies.some(e=>Math.hypot(e.x-x,e.y-y)<TILE_SIZE*.8))continue;
      if(validFloorForEnemy(x,y,14))spots.push({x,y});
    }
    for(let i=spots.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[spots[i],spots[j]]=[spots[j],spots[i]]}
    while(combatEnemies()<minimumCombat&&spots.length){
      const p=spots.pop();
      enemies.push(new Enemy(p.x,p.y,pool[Math.floor(Math.random()*pool.length)]));
    }
  };

  stats.speedLevel=1;
  stats.hullLevel=1;
  stats.damageLevel=1;
  stats.repairCount=0;
  const CAPS={fireRate:6,spread:5,speed:5};
  const BASE={fireRate:300,spread:500,speed:300,flak:400,missileUpg:400,damage:450,hullMax:400};
  function levelFor(type){
    if(type==='fireRate')return stats.fireRateLevel;
    if(type==='spread')return stats.spread;
    if(type==='speed')return stats.speedLevel;
    if(type==='flak')return stats.flakLevel;
    if(type==='missileUpg')return stats.missileLevel;
    if(type==='damage')return stats.damageLevel;
    return stats.hullLevel;
  }
  function isMax(type){return CAPS[type]&&levelFor(type)>=CAPS[type]}
  function upgradeCost(type){
    const level=levelFor(type);
    const growth=CAPS[type]?1.55:1.32;
    return Math.round(BASE[type]*Math.pow(growth,Math.max(0,level-1))/50)*50;
  }
  function repairCost(){
    const missing=Math.max(0,maxHp-hp);if(!missing)return 0;
    const hullFactor=1+(maxHp-100)/350;
    const repeatFactor=1+stats.repairCount*.10;
    return Math.max(100,Math.round((90+missing*2.2)*hullFactor*repeatFactor/50)*50);
  }
  function item(type,name,desc){
    const div=document.createElement('div');div.className='shop-item';
    const max=isMax(type),cost=upgradeCost(type),lv=levelFor(type);
    div.innerHTML=`<div class="shop-info"><strong>${name}</strong><p>${desc} · ${max?'MAX':('Lv '+lv+(CAPS[type]?'/'+CAPS[type]:''))}</p></div><button ${max?'disabled':''}>${max?'MAX':cost+' Sv'}</button>`;
    div.querySelector('button').onclick=()=>buyUpgrade(type);
    return div;
  }
  function renderEnhancedShop(){
    shopGrid.innerHTML='';
    shopGrid.append(
      item('fireRate','Shooting Speed Coils','Capped cannon reload speed'),
      item('spread','Projectile Multibarrels','Capped at five-way spread'),
      item('speed','Overcharged Thrusters','Capped movement speed'),
      item('damage','Heavy Cannon Core','Open-ended main cannon damage'),
      item('flak','Thermal Flak Shells','Open-ended flak power and radius'),
      item('missileUpg','Homing Missile Calibrator','Open-ended seeker power'),
      item('hullMax','Dreadnought Hull Armor','Open-ended maximum hull')
    );
    const rc=repairCost(),missing=Math.max(0,Math.ceil(maxHp-hp));
    const repair=document.createElement('div');repair.className='shop-item tc-repair';
    repair.innerHTML=`<div class="shop-info"><strong>Field Repair</strong><p>Restore all missing hull · ${missing} HP damaged</p></div><button ${rc===0?'disabled':''}>${rc===0?'FULL':rc+' Sv'}</button>`;
    repair.querySelector('button').onclick=repairTank;
    shopGrid.append(repair);
  }
  triggerShop=function(){
    gameState='SHOP';bossHpBarContainer.style.display='none';syncHullHud();renderEnhancedShop();shopScreen.style.display='flex';
  };
  buyUpgrade=function(type){
    if(isMax(type))return;
    const cost=upgradeCost(type);
    if(score<cost){try{playTone(110,'square',.3,.1)}catch(e){};alert('Insufficient Salvage Value!');return}
    score-=cost;
    if(type==='fireRate')stats.fireRateLevel++;
    else if(type==='spread')stats.spread=Math.min(5,stats.spread+1);
    else if(type==='speed'){stats.speedLevel++;player.speed=Math.min(5.0,player.speed+.4)}
    else if(type==='damage'){stats.damageLevel++;stats.damage+=Math.max(.08,.32/(1+(stats.damageLevel-2)*.10))}
    else if(type==='flak')stats.flakLevel++;
    else if(type==='missileUpg')stats.missileLevel++;
    else if(type==='hullMax'){stats.hullLevel++;maxHp+=20;hp=Math.min(maxHp,hp+10)}
    try{playTone(440,'sine',.2,.2)}catch(e){}
    syncHullHud();renderEnhancedShop();
  };
  window.repairTank=function(){
    const cost=repairCost();if(!cost)return;
    if(score<cost){try{playTone(110,'square',.3,.1)}catch(e){};alert('Insufficient Salvage Value!');return}
    score-=cost;hp=maxHp;stats.repairCount++;
    try{playTone(520,'sine',.22,.15)}catch(e){}
    syncHullHud();renderEnhancedShop();
  };
  closeShop=function(){
    mapDepth++;mapVal.innerText=mapDepth;
    hp=Math.min(maxHp,hp+Math.max(5,maxHp*.08));
    syncHullHud();shopScreen.style.display='none';gameState='PLAYING';generateRogueMap();
  };
  triggerAoeExplosion=function(x,y){
    const radius=55+Math.min(120,Math.log2(stats.flakLevel+1)*28);
    particles.push(new ExplodingNova(x,y,radius,'#ff4500','PLAYER'));
    triggerExplosion(x,y,'#ffaa00');
  };
  const originalNovaUpdate=ExplodingNova.prototype.update;
  ExplodingNova.prototype.update=function(){
    if(this.originType!=='PLAYER'){return originalNovaUpdate.call(this)}
    this.curRadius+=5.0;if(this.curRadius>=this.maxRadius)this.active=false;
    if(this.active){
      const factor=.15+Math.min(1.25,Math.log2(stats.flakLevel+1)*.18);
      enemies.forEach(e=>{if(e.type!=='ROCK_BALL'&&e.active&&Math.hypot(e.x-this.x,e.y-this.y)<=this.curRadius+e.radius)e.hp-=factor});
    }
  };
  const baseReset=resetGame;
  resetGame=function(){
    baseReset();
    stats.speedLevel=1;stats.hullLevel=1;stats.damageLevel=1;stats.repairCount=0;stats.damage=1;
    maxHp=100;hp=100;player.speed=3.4;syncHullHud();
  };
  resizeViewport();generateRogueMap();syncHullHud();
  window.addEventListener('orientationchange',()=>setTimeout(()=>{resizeViewport();generateRogueMap()},180));
})();