import * as THREE from 'three';
import './style.css';
import Peer from 'peerjs';

async function boot(){
const [weaponsData, arenaData] = await Promise.all([
  fetch(`${import.meta.env.BASE_URL}data/weapons.json`).then(r => r.json()),
  fetch(`${import.meta.env.BASE_URL}data/arena.json`).then(r => r.json()),
]);

const $ = (id) => document.getElementById(id);
const ui = { menu:$('menu'),hud:$('hud'),shop:$('shop'),result:$('result'),toast:$('toast') };

const scene = new THREE.Scene();
scene.background = new THREE.Color('#7ca8d8');
scene.fog = new THREE.Fog('#7ca8d8', 50, 280);
const camera = new THREE.PerspectiveCamera(76, innerWidth/innerHeight, .08, 400);
camera.rotation.order='YXZ';
scene.add(camera);

const renderer = new THREE.WebGLRenderer({canvas:$('game'),antialias:false});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.65)); renderer.setSize(innerWidth,innerHeight); renderer.shadowMap.enabled=true; renderer.outputColorSpace=THREE.SRGBColorSpace;
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.0));
const sun = new THREE.DirectionalLight(0xffe3b3, 2.5); sun.position.set(-80,150,-50); sun.castShadow=true; 
sun.shadow.camera.top = 250; sun.shadow.camera.bottom = -250; sun.shadow.camera.left = -250; sun.shadow.camera.right = 250; scene.add(sun);

// === ТЕКСТУРЫ ===
function createPixelTexture(baseColor, noiseColor, repeat=4) {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = baseColor; ctx.fillRect(0,0,64,64);
  ctx.fillStyle = noiseColor;
  for(let i=0; i<1200; i++) ctx.fillRect(Math.random()*64, Math.random()*64, 2, 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeat, repeat);
  return tex;
}
const grassTex = createPixelTexture('#3e6b48', '#2d4f35', 80); 
const stoneTex = createPixelTexture('#757671', '#5a5c56', 4);
const woodTex = createPixelTexture('#6b4c33', '#4a3524', 2);
const pixelUniformBlue = createPixelTexture('#2c3e50', '#1a2530', 2);
const pixelUniformGold = createPixelTexture('#8c6b42', '#5e472c', 2);
const pixelSkin = createPixelTexture('#d1a77f', '#b08963', 1);

// === ОРУЖИЕ ===
const playerGun = new THREE.Group(); camera.add(playerGun);
const gunMetal = new THREE.MeshStandardMaterial({color:'#252c2b'});
const gunPolymer = new THREE.MeshStandardMaterial({color:'#3b403a'});
const gloveMat = new THREE.MeshStandardMaterial({color:'#3d4038'});
const muzzleFlashMat = new THREE.MeshBasicMaterial({color:'#ffd700', transparent:true, opacity:0});
let muzzleFlash;

function updateGunModel(weaponId) {
  playerGun.clear();
  const add = (w,h,d,x,y,z,m) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m); mesh.position.set(x,y,z); playerGun.add(mesh); };
  add(.15,.15,.25,-.15,-.15,.1,gloveMat); add(.15,.15,.25,.15,-.15,.1,gloveMat);
  
  let barrelZ = -0.6;
  if (weaponId === 'p2000' || weaponId === 'glock') { add(.1,.12,.3,0,-.05,-.1,gunMetal); add(.08,.15,.1,0,-.12,.05,gunPolymer); }
  else if (weaponId === 'deagle') { add(.12,.15,.4,0,-.05,-.15,gunMetal); add(.1,.18,.12,0,-.15,.05,gunMetal); barrelZ = -0.7; }
  else if (weaponId === 'mp5' || weaponId === 'p90') { add(.12,.15,.45,0,-.05,-.2,gunMetal); add(.1,.2,.2,0,-.15,.05,gunPolymer); add(.06,.06,.2,0,.02,-.5,gunMetal); barrelZ = -0.8; }
  else if (weaponId === 'ak47') { add(.12,.15,.6,0,-.05,-.3,gunMetal); add(.1,.15,.2,0,-.18,.1,woodTex); add(.08,.12,.25,0,-.05,-.6,woodTex); barrelZ = -0.9; }
  else if (weaponId === 'm4a4') { add(.1,.15,.65,0,-.05,-.3,gunMetal); add(.08,.18,.15,0,-.15,.1,gunPolymer); add(.06,.06,.3,0,.02,-.6,gunPolymer); barrelZ = -0.9; }
  else if (weaponId === 'awp') { add(.12,.15,.7,0,-.05,-.35,gunPolymer); add(.1,.2,.2,0,-.18,.1,gunPolymer); add(.04,.04,.5,0,.02,-.7,gunMetal); add(.06,.08,.2,0,.12,-.1,gunMetal); barrelZ = -1.2; }
  else { add(.12,.15,.5,0,-.05,-.2,gunMetal); }

  muzzleFlash = new THREE.Mesh(new THREE.SphereGeometry(.2, 4, 4), muzzleFlashMat);
  muzzleFlash.position.set(0, 0, barrelZ); playerGun.add(muzzleFlash);
  playerGun.position.set(.34,-.34,-.52);
}

// === АРЕНА ===
const mats = { grass:new THREE.MeshStandardMaterial({map: grassTex}), stone:new THREE.MeshStandardMaterial({map: stoneTex}), wood:new THREE.MeshStandardMaterial({map: woodTex}), metal:new THREE.MeshStandardMaterial({color:'#313b3c'}), skin:new THREE.MeshStandardMaterial({map: pixelSkin}) };
const boxGeo = new THREE.BoxGeometry(1,1,1);
const blockers = [];

function box(x,y,z,w,h,d,mat,cast=true){const m=new THREE.Mesh(boxGeo,mat);m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=cast;m.receiveShadow=true;scene.add(m);blockers.push(m);return m;}
function createStairs(startX, startY, startZ, dir, steps, width, mat) {
  for(let i=0; i<steps; i++) {
    const stepH = 0.3, stepD = 0.8;
    if(dir === 'z-') box(startX, startY + i*stepH + stepH/2, startZ - i*stepD, width, stepH, stepD, mat);
    if(dir === 'z+') box(startX, startY + i*stepH + stepH/2, startZ + i*stepD, width, stepH, stepD, mat);
  }
}

function makeArena(){
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(arenaData.size.width + 100, arenaData.size.depth + 100), mats.grass); floor.rotation.x = -Math.PI/2; floor.receiveShadow = true; scene.add(floor);
  
  box(0, 25, 0, 150, 50, 40, mats.stone); 
  box(-60, 6, -80, 40, 12, 4, mats.stone);
  box(60, 6, 80, 40, 12, 4, mats.stone);
  box(-40, 6, 60, 4, 12, 40, mats.stone);
  box(40, 6, -60, 4, 12, 40, mats.stone);

  const buildTower = (tx, tz) => {
    box(tx, 4, tz, 8, 8, 8, mats.stone);
    box(tx, 8.25, tz, 10, 0.5, 10, mats.wood);
    box(tx, 8.75, tz-4.75, 10, 1, 0.5, mats.stone);
    box(tx, 8.75, tz+4.75, 10, 1, 0.5, mats.stone);
    box(tx-4.75, 8.75, tz, 0.5, 1, 10, mats.stone);
    box(tx+4.75, 8.75, tz, 0.5, 1, 10, mats.stone);
  };
  buildTower(-70, -130); buildTower(70, -130);
  buildTower(-70, 130); buildTower(70, 130);

  createStairs(-70, 0, -126, 'z-', 27, 3, mats.stone);
  createStairs(70, 0, -126, 'z-', 27, 3, mats.stone);
  createStairs(-70, 0, 126, 'z+', 27, 3, mats.stone);
  createStairs(70, 0, 126, 'z+', 27, 3, mats.stone);

  box(0, 10, -220, 300, 20, 4, mats.stone);
  box(0, 10, 220, 300, 20, 4, mats.stone);
  box(-150, 10, 0, 4, 20, 440, mats.stone);
  box(150, 10, 0, 4, 20, 440, mats.stone);

  for(let i=0; i<200; i++) {
    const x = (Math.random() - 0.5) * 280;
    const z = (Math.random() - 0.5) * 380;
    if (Math.abs(x) < 80 && Math.abs(z) < 30) continue; 
    if (Math.abs(z) > 160) continue; 

    const type = Math.floor(Math.random() * 3);
    if (type === 0) {
      const s = 1 + Math.random() * 3;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), mats.stone);
      rock.position.set(x, s/2, z); rock.rotation.set(Math.random(), Math.random(), Math.random());
      rock.castShadow = true; scene.add(rock); blockers.push(rock);
    } else if (type === 1) {
      box(x, 1.5, z, 3, 3, 3, mats.wood);
    } else {
      const bush = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), new THREE.MeshStandardMaterial({color:'#2e4d2e'}));
      bush.position.set(x, 1.5, z); bush.castShadow = true; scene.add(bush); blockers.push(bush);
    }
  }
}
makeArena();

// === ПЕРСОНАЖИ ===
function buildCharacter(team, isAlly=false){
  const root=new THREE.Group();root.userData.health=100;root.userData.team=team;
  const uniformMat = new THREE.MeshStandardMaterial({ map: team === 'blue' ? pixelUniformBlue : pixelUniformGold });
  const dark = new THREE.MeshStandardMaterial({color:'#292e2d'});
  const add=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;root.add(m);return m;};
  
  add(new THREE.BoxGeometry(.6, .8, .4), uniformMat, 0, 1.2, 0);
  add(new THREE.BoxGeometry(.4, .4, .4), mats.skin, 0, 1.8, 0);
  add(new THREE.BoxGeometry(.42, .1, .42), dark, 0, 1.85, .05);
  
  const leftLeg = add(new THREE.BoxGeometry(.2, .6, .2), dark, -.2, 0.3, 0);
  const rightLeg = add(new THREE.BoxGeometry(.2, .6, .2), dark, .2, 0.3, 0);
  root.userData.legs = [leftLeg, rightLeg];
  
  add(new THREE.BoxGeometry(.15, .6, .15), uniformMat, -.4, 1.2, 0);
  add(new THREE.BoxGeometry(.15, .6, .15), uniformMat, .4, 1.2, 0);
  add(new THREE.BoxGeometry(.1, .1, .8), mats.metal, .45, 1.1, .4);
  
  return root;
}

// === ЛОГИКА ===
const raycaster = new THREE.Raycaster(); const clock = new THREE.Clock();
let player = {
  pos: new THREE.Vector3(0,0,-180), yaw: 0, pitch: 0, velY: 0, isGrounded: true,
  health: 100, money: 800, weapon: null, ammo: 0, reserve: 0, reloading: false, lastShot: 0,
  team: 'blue', aiming: false, recoil: 0, shake: 0, dead: false
};
let bots = [], allies = [], keys = {}, started = false, paused = false, autoFire = false;
let roundNum = 1, playerScore = 0, botScore = 0, maxScore = 1, lastShotPos = new THREE.Vector3(), lastShotTime = 0;
let roundTimeout = null;

function startMatch(team) {
  player.team = team; maxScore = parseInt($('rounds').value) || 3;
  playerScore = 0; botScore = 0; roundNum = 1; player.money = 800;
  startRound();
  ui.menu.classList.add('hidden'); ui.hud.classList.remove('hidden'); ui.result.classList.add('hidden');
}

function startRound() {
  clearTimeout(roundTimeout);
  player.dead = false; player.health = 100;
  player.weapon = weaponsData.weapons[0]; player.ammo = player.weapon.magazine; player.reserve = player.weapon.reserve;
  const spawn = arenaData.spawn[player.team]; player.pos.set(spawn[0], 0, spawn[2]);
  updateGunModel(player.weapon.id); playerGun.visible = true;

  bots.forEach(b => scene.remove(b)); allies.forEach(a => scene.remove(a)); bots = []; allies = [];

  const count = +$('enemy-count').value, allyCount = +$('ally-count').value;
  const enemySpawns = player.team === 'blue' ? arenaData.goldSpawns : arenaData.blueSpawns;
  const allySpawns = player.team === 'blue' ? arenaData.blueSpawns : arenaData.goldSpawns;

  for(let i=0; i<count; i++) {
    const b = buildCharacter(player.team==='blue'?'gold':'blue');
    const sp = enemySpawns[i % enemySpawns.length]; b.position.set(sp[0], 0, sp[2]); scene.add(b); bots.push(b);
  }
  for(let i=0; i<allyCount; i++) {
    const a = buildCharacter(player.team, true);
    const sp = allySpawns[(i+1) % allySpawns.length]; a.position.set(sp[0], 0, sp[2]); scene.add(a); allies.push(a);
  }

  started = true; paused = false;
  $('round-num').textContent = roundNum; $('score').textContent = `${playerScore}:${botScore}`;
  syncHud(); pointerLock();
}

function pointerLock(){ if(started && ui.shop.classList.contains('hidden') && !player.dead && document.pointerLockElement!==$('game')) $('game').requestPointerLock?.(); }

function syncHud(){
  $('health').textContent = Math.max(0, Math.ceil(player.health));
  $('health-fill').style.width = Math.max(0, player.health) + '%';
  $('money').textContent = player.money.toLocaleString();
  if(player.weapon) { $('weapon-name').textContent = player.weapon.name; $('ammo').textContent = player.ammo; $('reserve').textContent = player.reserve; }
  $('alive').textContent = `${allies.filter(a=>a.userData.health>0).length + (player.dead?0:1)} : ${bots.filter(b=>b.userData.health>0).length}`;
}

function showToast(text){ ui.toast.textContent = text; ui.toast.classList.remove('hidden'); setTimeout(()=>ui.toast.classList.add('hidden'), 2000); }

function damagePlayer(amount){
  if (player.dead) return;
  player.health -= amount; player.shake = 0.4; syncHud();
  if(player.health <= 0){ player.health = 0; player.dead = true; checkRoundEnd(); }
}

function checkCollision(nx, nz, currentY) {
  for (const o of blockers) {
    const bBox = new THREE.Box3().setFromObject(o);
    if (nx > bBox.min.x - 0.4 && nx < bBox.max.x + 0.4 && nz > bBox.min.z - 0.4 && nz < bBox.max.z + 0.4) {
      if (bBox.max.y > currentY + 0.45) return { hit: true, stepY: null };
      else if (bBox.max.y > currentY + 0.05) return { hit: false, stepY: bBox.max.y };
    }
  }
  return { hit: false, stepY: null };
}

function shoot(){
  if(!started || !ui.shop.classList.contains('hidden') || player.reloading || player.ammo <= 0 || player.dead) return;
  const now = performance.now()/1000;
  if(now - player.lastShot < player.weapon.fireRate) return;
  player.lastShot = now; player.ammo--; player.recoil = player.aiming ? 1 : 2.5;
  lastShotPos.copy(player.pos); lastShotTime = now;
  syncHud();

  if(muzzleFlash) {
    muzzleFlash.material.opacity = 1; muzzleFlash.scale.set(1.5,1.5,1.5);
    setTimeout(() => { if(muzzleFlash) muzzleFlash.material.opacity = 0; }, 50);
  }

  const spread = player.weapon.spread * (player.aiming ? 0.2 : 1);
  const dir = new THREE.Vector3((Math.random()-.5)*spread, (Math.random()-.5)*spread, -1).applyEuler(camera.rotation).normalize();
  raycaster.set(camera.position, dir);
  
  const targets = [];
  bots.forEach(b => b.traverse(o => { if(o.isMesh) targets.push(o); }));
  const hits = raycaster.intersectObjects(targets, false);
  const wall = raycaster.intersectObjects(blockers, false)[0];

  let hitObj = null;
  if (hits.length && (!wall || hits[0].distance < wall.distance)) {
    hitObj = hits[0].object; while(hitObj.parent && !hitObj.userData.health) hitObj = hitObj.parent;
  }

  if (hitObj && hitObj.userData.health) {
    const hm = $('hitmarker'); hm.classList.add('active'); setTimeout(() => hm.classList.remove('active'), 100);
    hitObj.userData.health -= player.weapon.damage;
    if (hitObj.userData.health <= 0) {
      scene.remove(hitObj); player.money += 300; showToast('+$300 за фраг!'); syncHud(); checkRoundEnd();
    }
  }
}

function reload(){
  if(player.reloading || player.ammo >= player.weapon.magazine || player.reserve <= 0 || player.dead) return;
  player.reloading = true; showToast('Перезарядка...');
  setTimeout(() => {
    const need = player.weapon.magazine - player.ammo; const load = Math.min(need, player.reserve);
    player.ammo += load; player.reserve -= load; player.reloading = false; syncHud();
  }, player.weapon.reloadTime || 1500);
}

function checkRoundEnd() {
  const aliveBots = bots.filter(b => b.userData.health > 0);
  
  if (player.dead || aliveBots.length === 0) {
    started = false; document.exitPointerLock?.();
    
    if(roundTimeout) clearTimeout(roundTimeout);
    
    roundTimeout = setTimeout(() => {
      if (player.dead) botScore++; else playerScore++;
      $('score').textContent = `${playerScore}:${botScore}`;
      
      if (playerScore > maxScore/2 || botScore > maxScore/2) {
        ui.hud.classList.add('hidden'); ui.result.classList.remove('hidden');
        const win = playerScore > botScore;
        $('result-title').textContent = win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ';
        $('result-title').style.color = win ? '#dfbd7e' : '#c6785d';
      } else {
        roundNum++; startRound();
      }
    }, 2000);
  }
}

// === УМНЫЙ ИИ (С проверкой линии видимости) ===
function updateActors(dt, t) {
  const allActors = [...bots, ...allies];
  const botRay = new THREE.Raycaster(); // Отдельный рейкастер для ботов

  for (const actor of allActors) {
    if (actor.userData.health <= 0) continue;
    
    const isAlly = allies.includes(actor);
    const enemies = isAlly ? bots : allies;
    let target = null, dist = Infinity;
    
    // Ищем ближайшего врага
    for (const e of enemies) {
      if (e.userData.health <= 0) continue;
      const d = actor.position.distanceTo(e.position);
      if (d < dist) { dist = d; target = e; }
    }
    if (!isAlly && !player.dead) {
      const d = actor.position.distanceTo(player.pos);
      if (d < dist) { dist = d; target = player; }
    }

    let targetPos = new THREE.Vector3(0, 0, 0);
    let isAttacking = false;
    let canSee = false;

    // Если враг в радиусе 60 метров
    if (target && dist < 60) {
      targetPos = target === player ? player.pos : target.position;
      
      // ПРОВЕРКА ЛИНИИ ВИДИМОСТИ (Line of Sight)
      const rayOrigin = actor.position.clone().add(new THREE.Vector3(0, 1.5, 0)); // Глаза бота
      const rayTarget = targetPos.clone().add(new THREE.Vector3(0, 1.5, 0)); // Грудь цели
      const rayDir = new THREE.Vector3().subVectors(rayTarget, rayOrigin).normalize();
      
      botRay.set(rayOrigin, rayDir);
      botRay.far = dist;
      const wallHits = botRay.intersectObjects(blockers, false);

      // Если стены на пути нет, или она дальше цели
      if (wallHits.length === 0 || wallHits[0].distance > dist - 1) {
        canSee = true;
        isAttacking = true;
      }
    } else if (t - lastShotTime < 5.0) {
      targetPos = lastShotPos; // Идем на звук
    }

    // Поворот к цели
    if (targetPos.lengthSq() > 0) {
      actor.lookAt(targetPos.x, actor.position.y, targetPos.z);
    }
    
    // Движение
    let moveDir = new THREE.Vector3().subVectors(targetPos, actor.position).setY(0).normalize();
    
    // Если мы видим цель и она близко — останавливаемся и стреляем
    if (canSee && dist < 8) {
      moveDir.set(0,0,0); 
    } else if (!canSee && target) {
      // Если не видим, но знаем где — бежим туда
    } else {
      // Расталкивание
      let pushAway = new THREE.Vector3();
      for (const other of allActors) {
        if (actor === other || other.userData.health <= 0) continue;
        const d = actor.position.distanceTo(other.position);
        if (d < 2.5 && d > 0) pushAway.add(actor.position.clone().sub(other.position).normalize().multiplyScalar(2.5 - d));
      }
      moveDir.add(pushAway).normalize();
    }

    const speed = 5 * dt;
    const nextX = actor.position.x + moveDir.x * speed;
    const nextZ = actor.position.z + moveDir.z * speed;
    
    let colX = checkCollision(nextX, actor.position.z, actor.position.y);
    if (!colX.hit) actor.position.x = nextX;
    let colZ = checkCollision(actor.position.x, nextZ, actor.position.y);
    if (!colZ.hit) actor.position.z = nextZ;

    if (moveDir.lengthSq() > 0.1) {
      actor.userData.animTime = (actor.userData.animTime || 0) + dt * 15;
      const swing = Math.sin(actor.userData.animTime) * 0.8;
      if(actor.userData.legs) { actor.userData.legs[0].rotation.x = swing; actor.userData.legs[1].rotation.x = -swing; }
    } else {
      if(actor.userData.legs) { actor.userData.legs[0].rotation.x = 0; actor.userData.legs[1].rotation.x = 0; }
    }

    // СТРЕЛЬБА (Только если видим цель)
    if (isAttacking && canSee) {
      if (!actor.userData.nextShotTime) actor.userData.nextShotTime = 0;
      
      if (t > actor.userData.nextShotTime) {
        // Задержка между выстрелами (от 0.5 до 1 секунды)
        actor.userData.nextShotTime = t + 0.5 + Math.random() * 0.5;

        // Попадание
        if (Math.random() < 0.4) { // 40% шанс попасть, чтобы не убивали мгновенно
          if (target === player) damagePlayer(10);
          else { 
            target.userData.health -= 10; 
            if(target.userData.health <= 0) { scene.remove(target); checkRoundEnd(); } 
          }
        }
      }
    }
  }
}

function animate(){
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), .04);
  const t = performance.now()/1000;

  if(started && !paused && !player.dead){
    const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    let move = new THREE.Vector3();
    if(keys.KeyW) move.add(forward); if(keys.KeyS) move.sub(forward);
    if(keys.KeyD) move.add(right); if(keys.KeyA) move.sub(right);

    if(move.lengthSq()) move.normalize().multiplyScalar((keys.ShiftLeft ? 12 : 8) * dt);
    
    player.velY -= 25 * dt; player.pos.y += player.velY * dt;
    
    const nextX = player.pos.x + move.x, nextZ = player.pos.z + move.z;
    let colX = checkCollision(nextX, player.pos.z, player.pos.y);
    if (!colX.hit) { player.pos.x = nextX; if (colX.stepY !== null) { player.pos.y = colX.stepY; player.velY = 0; } }
    let colZ = checkCollision(player.pos.x, nextZ, player.pos.y);
    if (!colZ.hit) { player.pos.z = nextZ; if (colZ.stepY !== null) { player.pos.y = colZ.stepY; player.velY = 0; } }

    if (player.pos.y <= 0) { player.pos.y = 0; player.velY = 0; player.isGrounded = true; } else { player.isGrounded = false; }

    const baseFov = 80; const adsFov = 55;
    camera.fov += ((player.aiming ? adsFov : baseFov) - camera.fov) * 15 * dt; camera.updateProjectionMatrix();
    
    player.recoil = Math.max(0, player.recoil - dt * 8);
    player.shake = Math.max(0, player.shake - dt * 2);

    camera.position.set(player.pos.x, player.pos.y + 1.67, player.pos.z);
    if (player.shake > 0) {
      camera.position.x += (Math.random() - 0.5) * player.shake;
      camera.position.y += (Math.random() - 0.5) * player.shake;
    }
    camera.rotation.set(player.pitch + player.recoil * 0.05, player.yaw, 0);

    const targetGunPos = player.aiming ? new THREE.Vector3(0, -0.15, -0.4 + player.recoil*0.1) : new THREE.Vector3(0.34, -0.34, -0.52 + player.recoil*0.1);
    playerGun.position.lerp(targetGunPos, 15 * dt);

    updateActors(dt, t);
    if(autoFire) shoot();
  }

  renderer.render(scene, camera);
}

addEventListener('resize', () => { camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

addEventListener('keydown', e => {
  keys[e.code] = true;
  if(e.code === 'Space' && player.isGrounded && started && !player.dead) { player.velY = 9; player.isGrounded = false; }
  if(e.code === 'KeyR' && started) reload();
  if(e.code === 'KeyB' && started && !player.dead) { 
    const isHidden = ui.shop.classList.contains('hidden');
    if(isHidden) { ui.shop.classList.remove('hidden'); document.exitPointerLock(); renderShop(); }
    else { ui.shop.classList.add('hidden'); pointerLock(); }
  }
  if(e.code === 'Escape' && started && !player.dead) { paused = true; document.exitPointerLock(); }
});

addEventListener('keyup', e => keys[e.code] = false);

document.addEventListener('mousemove', e => {
  if(document.pointerLockElement === $('game') && started && !paused && !player.dead) {
    player.yaw -= e.movementX * 0.0022; player.pitch -= e.movementY * 0.0022;
    player.pitch = THREE.MathUtils.clamp(player.pitch, -1.35, 1.35);
  }
});

$('game').addEventListener('mousedown', e => {
  if(e.button === 0 && started && !paused && !player.dead) autoFire = true;
  if(e.button === 2 && started && !paused && !player.dead) player.aiming = true;
});

addEventListener('mouseup', e => {
  if(e.button === 0) autoFire = false;
  if(e.button === 2) player.aiming = false;
});

$('game').addEventListener('contextmenu', e => e.preventDefault());

$('game').addEventListener('click', () => {
  if(started && document.pointerLockElement !== $('game') && !player.dead) { paused = false; pointerLock(); }
});

$('btn-single').onclick = () => { $('main-menu-buttons').classList.add('hidden'); $('single-settings').classList.remove('hidden'); };
$('start').onclick = () => startMatch($('side').value);
$('restart').onclick = () => location.reload();

$('shop-open').onclick = () => { ui.shop.classList.remove('hidden'); document.exitPointerLock(); renderShop(); };
$('shop-close').onclick = () => { ui.shop.classList.add('hidden'); pointerLock(); };

function renderShop() {
  $('shop-money').textContent = player.money;
  const host = $('shop-items'); host.innerHTML = '';
  weaponsData.weapons.forEach(w => {
    const btn = document.createElement('button'); btn.className = 'weapon-card';
    btn.innerHTML = `<strong>${w.name}</strong><small>${w.damage} dmg</small><span class="price">$${w.price}</span>`;
    btn.onclick = () => { 
      if(player.money >= w.price) { 
        player.money -= w.price; player.weapon = w; player.ammo = w.magazine; player.reserve = w.reserve; 
        updateGunModel(w.id); syncHud(); renderShop(); 
      } 
    };
    host.append(btn);
  });
}

updateGunModel('p2000');
animate();

}
boot().catch(err => console.error(err));