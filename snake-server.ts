import { createServer } from "node:http";

const PORT = Number(process.env.PORT) || 3456;

const HTML = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Snake</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html,body{
    height:100%;
    background:#0a0a0f;
    color:#e0e0e0;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    overflow:hidden;
    user-select:none;
  }
  #hud{
    width:100%;max-width:600px;
    display:flex;justify-content:space-between;
    padding:12px 4px 8px;
    font-size:16px;
    letter-spacing:1px;
    text-transform:uppercase;
  }
  #hud span{opacity:.7}
  #hud .val{
    color:#00ffc8;
    text-shadow:0 0 6px #00ffc855;
    font-weight:700;
  }
  #wrap{
    position:relative;
    width:100%;max-width:600px;
    aspect-ratio:1/1;
  }
  canvas{
    display:block;
    width:100%;height:100%;
    border-radius:6px;
    box-shadow:0 0 30px #00ffc818,0 0 80px #00ffc808;
  }
  #overlay{
    position:absolute;inset:0;
    display:flex;flex-direction:column;
    align-items:center;justify-content:center;
    background:rgba(6,6,12,.82);
    border-radius:6px;
    backdrop-filter:blur(4px);
    transition:opacity .25s;
    pointer-events:auto;
  }
  #overlay.hidden{opacity:0;pointer-events:none}
  #overlay h1{
    font-size:clamp(28px,5vw,42px);
    color:#00ffc8;
    text-shadow:0 0 20px #00ffc866;
    margin-bottom:12px;
  }
  #overlay p{
    font-size:clamp(13px,2.5vw,17px);
    color:#bbb;
    margin:4px 0;
    line-height:1.6;
    text-align:center;
  }
  #overlay .key{
    display:inline-block;
    background:#1a1a2e;
    border:1px solid #333;
    border-radius:4px;
    padding:1px 7px;
    font-size:.9em;
    color:#fff;
  }
  #overlay .score-final{
    font-size:clamp(20px,4vw,32px);
    color:#ff6b6b;
    text-shadow:0 0 14px #ff6b6b55;
    margin:8px 0 16px;
    font-weight:700;
  }
</style>
</head>
<body>
<div id="hud">
  <div>Score: <span class="val" id="score">0</span></div>
  <div>Best: <span class="val" id="best">0</span></div>
</div>
<div id="wrap">
  <canvas id="c"></canvas>
  <div id="overlay">
    <h1>Snake</h1>
    <p>Use <span class="key">↑</span><span class="key">↓</span><span class="key">←</span><span class="key">→</span> or <span class="key">W</span><span class="key">A</span><span class="key">S</span><span class="key">D</span> to move</p>
    <p style="margin-top:10px">Press any direction key to start</p>
  </div>
</div>

<script>
(function(){
  /* ── constants ── */
  const COLS=30,ROWS=30;
  const canvas=document.getElementById("c");
  const ctx=canvas.getContext("2d");
  const scoreEl=document.getElementById("score");
  const bestEl=document.getElementById("best");
  const overlay=document.getElementById("overlay");

  let cellW,cellH;
  function resize(){
    const wrap=document.getElementById("wrap");
    const sz=wrap.clientWidth;
    canvas.width=sz*devicePixelRatio;
    canvas.height=sz*devicePixelRatio;
    ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
    cellW=sz/COLS;cellH=sz/ROWS;
  }
  resize();
  window.addEventListener("resize",resize);

  /* ── state ── */
  const DIR={UP:{x:0,y:-1},DOWN:{x:0,y:1},LEFT:{x:-1,y:0},RIGHT:{x:1,y:0}};
  let snake,dir,nextDir,food,score,highScore,state,speed,elapsed,lastTime;

  function loadHigh(){
    try{highScore=Number(localStorage.getItem("snake_hi"))||0}catch{highScore=0}
    bestEl.textContent=highScore;
  }
  function saveHigh(){
    if(score>highScore){highScore=score;try{localStorage.setItem("snake_hi",highScore)}catch{}}
    bestEl.textContent=highScore;
  }

  function init(){
    const cx=Math.floor(COLS/2),cy=Math.floor(ROWS/2);
    snake=[{x:cx,y:cy},{x:cx-1,y:cy},{x:cx-2,y:cy}];
    dir=DIR.RIGHT;nextDir=DIR.RIGHT;
    score=0;scoreEl.textContent=0;
    speed=130;elapsed=0;lastTime=0;
    placeFood();
    loadHigh();
    state="idle";
    overlay.classList.remove("hidden");
    overlay.innerHTML=\`
      <h1>Snake</h1>
      <p>Use <span class="key">↑</span><span class="key">↓</span><span class="key">←</span><span class="key">→</span> or <span class="key">W</span><span class="key">A</span><span class="key">S</span><span class="key">D</span> to move</p>
      <p style="margin-top:10px">Press any direction key to start</p>\`;
    draw();
  }

  function placeFood(){
    const occupied=new Set(snake.map(s=>s.x+","+s.y));
    let pos;
    do{pos={x:Math.floor(Math.random()*COLS),y:Math.floor(Math.random()*ROWS)}}
    while(occupied.has(pos.x+","+pos.y));
    food=pos;
  }

  /* ── input ── */
  const keyMap={ArrowUp:DIR.UP,ArrowDown:DIR.DOWN,ArrowLeft:DIR.LEFT,ArrowRight:DIR.RIGHT,
    w:DIR.UP,W:DIR.UP,a:DIR.LEFT,A:DIR.LEFT,s:DIR.DOWN,S:DIR.DOWN,d:DIR.RIGHT,D:DIR.RIGHT};

  let inputQueue=[];
  document.addEventListener("keydown",e=>{
    if(e.key===" "&&state==="dead"){e.preventDefault();init();return}
    const d=keyMap[e.key];
    if(!d)return;
    e.preventDefault();
    if(state==="idle"){state="running";overlay.classList.add("hidden");lastTime=performance.now()}
    if(state==="running"){inputQueue.push(d)}
  });

  function processInput(){
    while(inputQueue.length){
      const d=inputQueue.shift();
      if(d.x+dir.x!==0||d.y+dir.y!==0){nextDir=d;break}
    }
    inputQueue=[];
  }

  /* ── update ── */
  function step(){
    dir=nextDir;
    const head={x:snake[0].x+dir.x,y:snake[0].y+dir.y};
    if(head.x<0||head.x>=COLS||head.y<0||head.y>=ROWS)return die();
    for(let i=0;i<snake.length;i++)if(snake[i].x===head.x&&snake[i].y===head.y)return die();
    snake.unshift(head);
    if(head.x===food.x&&head.y===food.y){
      score++;scoreEl.textContent=score;
      speed=Math.max(50,130-score*2);
      placeFood();
    }else{snake.pop()}
  }

  function die(){
    state="dead";
    saveHigh();
    overlay.classList.remove("hidden");
    overlay.innerHTML=\`
      <h1>Game Over</h1>
      <div class="score-final">Score: \${score}</div>
      <p>Best: \${highScore}</p>
      <p style="margin-top:14px">Press <span class="key">Space</span> to restart</p>\`;
  }

  /* ── draw ── */
  function draw(){
    const w=canvas.width/devicePixelRatio, h=canvas.height/devicePixelRatio;
    ctx.clearRect(0,0,w,h);

    /* background */
    ctx.fillStyle="#0d0d18";
    ctx.fillRect(0,0,w,h);

    /* grid */
    ctx.strokeStyle="rgba(255,255,255,.04)";
    ctx.lineWidth=.5;
    for(let x=0;x<=COLS;x++){ctx.beginPath();ctx.moveTo(x*cellW,0);ctx.lineTo(x*cellW,h);ctx.stroke()}
    for(let y=0;y<=ROWS;y++){ctx.beginPath();ctx.moveTo(0,y*cellH);ctx.lineTo(w,y*cellH);ctx.stroke()}

    /* food glow */
    const fx=food.x*cellW+cellW/2,fy=food.y*cellH+cellH/2;
    const fg=ctx.createRadialGradient(fx,fy,0,fx,fy,cellW*1.8);
    fg.addColorStop(0,"rgba(255,80,80,.25)");fg.addColorStop(1,"rgba(255,80,80,0)");
    ctx.fillStyle=fg;ctx.fillRect(fx-cellW*2,fy-cellH*2,cellW*4,cellH*4);

    /* food */
    ctx.fillStyle="#ff4d6d";
    ctx.shadowColor="#ff4d6d";ctx.shadowBlur=12;
    roundRect(food.x*cellW+1,food.y*cellH+1,cellW-2,cellH-2,4);
    ctx.shadowBlur=0;

    /* snake */
    const len=snake.length;
    for(let i=len-1;i>=0;i--){
      const t=1-i/len;
      const r=Math.round(0+t*0);
      const g=Math.round(180+t*75);
      const b=Math.round(140+t*60);
      const color="rgb("+r+","+g+","+b+")";
      ctx.fillStyle=color;
      if(i===0){ctx.shadowColor="#00ffc8";ctx.shadowBlur=14}
      roundRect(snake[i].x*cellW+.8,snake[i].y*cellH+.8,cellW-1.6,cellH-1.6,i===0?5:3);
      ctx.shadowBlur=0;
    }
  }

  function roundRect(x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.lineTo(x+w-r,y);ctx.arcTo(x+w,y,x+w,y+r,r);
    ctx.lineTo(x+w,y+h-r);ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
    ctx.lineTo(x+r,y+h);ctx.arcTo(x,y+h,x,y+h-r,r);
    ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);
    ctx.fill();
  }

  /* ── loop ── */
  function loop(ts){
    requestAnimationFrame(loop);
    if(state!=="running"){draw();return}
    if(!lastTime)lastTime=ts;
    elapsed+=ts-lastTime;
    lastTime=ts;
    if(elapsed>=speed){
      elapsed-=speed;
      processInput();
      step();
    }
    draw();
  }
  init();
  requestAnimationFrame(loop);
})();
</script>
</body>
</html>`;

const server = createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(HTML);
});

server.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});
