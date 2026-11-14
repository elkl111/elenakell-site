(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t * t * (3 - 2 * t);
  const span = (v, a, b) => clamp((v - a) / (b - a));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const desktop = () => innerWidth > 900;

  /* ---------- state ---------- */
  const mouse = { x: .7, y: .45, tx: .7, ty: .45, moved: false, px: 0, py: 0 };
  let scrollY = 0, vh = innerHeight;

  /* ---------- curtain ---------- */
  const open = () => document.body.classList.add('loaded');
  addEventListener('load', () => setTimeout(open, 500));
  setTimeout(open, 3500);

  /* ---------- WebGL scene ---------- */
  const canvas = $('#scene');
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
  let prog, U = {}, texReady = false, imgSize = [3, 2], skyReady = false, skySize = [4, 3], skyAmt = 0;

  const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FRAG = `
precision highp float;
uniform sampler2D uTex, uSky;
uniform vec2 uRes, uImg, uMouse, uSkyImg;
uniform float uSkyReady, uScroll;
uniform float uTime, uP, uLens, uReady;

float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float a=.5,v=0.;for(int i=0;i<4;i++){v+=a*noise(p);p*=2.03;a*=.5;}return v;}
float luma(vec3 c){return dot(c,vec3(.299,.587,.114));}

float stars(vec2 uv,float scale,float seed){
  vec2 g=uv*scale;vec2 id=floor(g);vec2 f=fract(g)-.5;
  float h=hash(id+seed);
  if(h<.86)return 0.;
  vec2 o=vec2(hash(id+seed+3.1),hash(id+seed+7.7))-.5;
  vec2 d=f-o*.7;
  float tw=.6+.4*sin(uTime*(1.+h*3.)+h*40.);
  float core=smoothstep(.09,.0,length(d));
  float flare=(h>.975)?(smoothstep(.45,0.,abs(d.x))*smoothstep(.03,0.,abs(d.y))+smoothstep(.45,0.,abs(d.y))*smoothstep(.03,0.,abs(d.x)))*.8:0.;
  return (core+flare)*tw;
}

void main(){
  vec2 uv=gl_FragCoord.xy/uRes;
  // once the painting has fully given way to the sky, draw only the sky (much cheaper)
  if(uP>.985){
    vec2 asp0=vec2(uRes.x/uRes.y,1.);
    float vig0=smoothstep(1.15,.25,length((uv-.5)*vec2(1.,1.2)));
    vec2 suv0=uv*asp0+vec2(0.,uTime*.004);
    float st0=stars(suv0,26.,1.)+stars(suv0,54.,9.)*.7;
    float sa0=uSkyImg.x/uSkyImg.y;
    vec2 ss0=asp0.x>sa0?vec2(1.,sa0/asp0.x):vec2(asp0.x/sa0,1.);
    float sz0=1.22+.04*sin(uTime*.05);
    vec2 kuv0=(uv-.5)*ss0/sz0+.5+vec2(sin(uTime*.021)*.02,-uScroll*.07+cos(uTime*.017)*.012)+(uMouse-.5)*.012;
    vec3 hub0=texture2D(uSky,kuv0).rgb;
    float hl0=luma(hub0);
    hub0*=.5+.5*smoothstep(.0,.6,hl0);
    hub0+=hub0*smoothstep(.7,1.,hl0)*.18*sin(uTime*1.3+kuv0.x*90.+kuv0.y*70.);
    hub0*=mix(.4,.72,vig0);
    vec3 c0=mix(vec3(.027,.039,.086)+vec3(1.,.93,.8)*st0,hub0+vec3(1.,.93,.8)*st0*.25,uSkyReady);
    c0+=(hash(gl_FragCoord.xy+uTime)-.5)*.035;
    gl_FragColor=vec4(c0,1.);
    return;
  }
  float ra=uRes.x/uRes.y, ia=uImg.x/uImg.y;
  vec2 s=ra>ia?vec2(1.,ia/ra):vec2(ra/ia,1.);
  float zoom=1.06+uP*.55;
  vec2 par=(uMouse-.5)*.014;
  vec2 focus=vec2(0.,.04);
  vec2 tuv=(uv-.5)*s/zoom+.5+par+focus*uP;
  tuv.x+=sin(uTime*.25+uv.y*3.)*.0012;

  vec3 col=texture2D(uTex,tuv).rgb;
  vec2 px=1.4/uRes*s/zoom;
  float tl=luma(texture2D(uTex,tuv+px*vec2(-1,1)).rgb), tc=luma(texture2D(uTex,tuv+px*vec2(0,1)).rgb), tr=luma(texture2D(uTex,tuv+px*vec2(1,1)).rgb);
  float ml=luma(texture2D(uTex,tuv+px*vec2(-1,0)).rgb), mr=luma(texture2D(uTex,tuv+px*vec2(1,0)).rgb);
  float bl=luma(texture2D(uTex,tuv+px*vec2(-1,-1)).rgb), bc=luma(texture2D(uTex,tuv+px*vec2(0,-1)).rgb), br=luma(texture2D(uTex,tuv+px*vec2(1,-1)).rgb);
  float gx=-tl-2.*ml-bl+tr+2.*mr+br, gy=-tl-2.*tc-tr+bl+2.*bc+br;
  float edge=smoothstep(.12,.7,length(vec2(gx,gy)));
  float L=luma(col);

  // painting, graded so the type stays readable
  vec3 paint=col*vec3(1.02,.98,.92);
  paint=mix(paint,paint*paint*1.25,.35);
  float vig=smoothstep(1.15,.25,length((uv-.5)*vec2(1.,1.2)));
  paint*=mix(.5,1.05,vig);
  paint*=mix(1.,.5,smoothstep(.84,1.,uv.y));
  float low=smoothstep(.72,.02,uv.y)*(1.-smoothstep(0.,.15,uP));
  paint=mix(paint,vec3(.02,.03,.05),low*.8);

  // what the machine sees
  vec3 night=vec3(.027,.039,.086);
  vec2 cell=gl_FragCoord.xy/7.;
  vec2 cf=fract(cell)-.5; vec2 cid=floor(cell);
  float tw=.55+.45*sin(uTime*2.+hash(cid)*30.);
  float dotR=L*.46*tw;
  float dots=smoothstep(dotR,dotR-.14,length(cf))*step(.12,L);
  vec3 gold=vec3(1.,.84,.5);
  vec3 ai=night+col*.12;
  ai+=gold*edge*.85;
  ai+=vec3(.95,.93,1.)*dots*.16;
  float scan=.5+.5*sin(gl_FragCoord.y*.9-uTime*3.);
  ai+=gold*edge*scan*.15;
  ai*=mix(1.,.38,smoothstep(.5,.0,length((uv-.5)*vec2(.55,1.4)))*smoothstep(.15,.3,uP));

  // masks: cursor lens + scroll bloom
  vec2 asp=vec2(ra,1.);
  float n=fbm(uv*asp*3.2+uTime*.12);
  float dm=length((uv-uMouse)*asp)+(n-.5)*.09;
  float lr=.17+.012*sin(uTime*1.7);
  float lens=smoothstep(lr,lr-.035,dm)*uLens*(1.-smoothstep(.0,.12,uP));
  float lensRim=smoothstep(.02,0.,abs(dm-lr+.012))*uLens*(1.-smoothstep(.0,.12,uP));
  float bp=smoothstep(.06,.62,uP);
  float R=bp*1.5;
  float dc=length((uv-vec2(.5,.52))*asp)+(n-.5)*.34;
  float bloom=smoothstep(R,R-.2,dc)*step(.001,bp);
  float bloomRim=smoothstep(.05,0.,abs(dc-R+.03))*step(.001,bp)*(1.-smoothstep(.55,.7,uP));
  float m=clamp(max(lens,bloom),0.,1.);

  vec3 c=mix(paint,ai,m);
  c+=gold*(lensRim*.9+bloomRim*.7);

  // the night sky
  vec2 suv=uv*asp+vec2(0.,uTime*.004);
  float st=stars(suv,26.,1.)+stars(suv,54.,9.)*.7+stars(suv,110.,4.)*.45;
  float neb=fbm(uv*asp*1.6+vec2(uTime*.01,0.));
  vec3 sky=night+vec3(.10,.07,.16)*smoothstep(.45,.9,neb)+vec3(.18,.09,.07)*smoothstep(.6,1.,fbm(uv*asp*2.4+7.))*.6;
  sky+=vec3(1.,.93,.8)*st;
  // the real thing: Hubble's view of Westerlund 2, drifting slowly
  float sa=uSkyImg.x/uSkyImg.y;
  vec2 ss=ra>sa?vec2(1.,sa/ra):vec2(ra/sa,1.);
  float sz=1.22+.04*sin(uTime*.05);
  vec2 kuv=(uv-.5)*ss/sz+.5+vec2(sin(uTime*.021)*.02,-uScroll*.07+cos(uTime*.017)*.012)+(uMouse-.5)*.012;
  vec3 hub=texture2D(uSky,kuv).rgb;
  float hl=luma(hub);
  hub*=.5+.5*smoothstep(.0,.6,hl);
  hub+=hub*smoothstep(.7,1.,hl)*.18*sin(uTime*1.3+kuv.x*90.+kuv.y*70.);
  hub*=mix(.4,.72,vig);
  vec3 real=hub+vec3(1.,.93,.8)*st*.25;
  sky=mix(sky,real,uSkyReady);
  float toSky=smoothstep(.6,.96,uP);
  c+=vec3(1.,.93,.8)*st*m*.5*(1.-toSky);
  c=mix(c,sky,toSky);

  c=mix(sky,c,uReady);
  c+=(hash(gl_FragCoord.xy+uTime)-.5)*.035;
  gl_FragColor=vec4(c,1.);
}`;

  function initGL() {
    if (!gl) return false;
    const mk = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); return null; }
      return s;
    };
    const vs = mk(gl.VERTEX_SHADER, VERT), fs = mk(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    ['uTex', 'uSky', 'uRes', 'uImg', 'uMouse', 'uTime', 'uP', 'uLens', 'uReady', 'uSkyImg', 'uSkyReady', 'uScroll'].forEach(n => U[n] = gl.getUniformLocation(prog, n));
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([7, 10, 22, 255]));
    const img = $('#hero-src');
    const upload = () => {
      try {
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        imgSize = [img.naturalWidth, img.naturalHeight];
        texReady = true;
      } catch (e) { console.warn('Painting texture unavailable', e); }
    };
    if (img.complete && img.naturalWidth) upload(); else { img.addEventListener('load', upload); }
    // second texture: the Hubble sky
    const skyTex = gl.createTexture(); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, skyTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([7, 10, 22, 255]));
    gl.activeTexture(gl.TEXTURE0);
    const skyImg = $('#sky-src');
    const upSky = () => {
      try {
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, skyTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, skyImg);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        skySize = [skyImg.naturalWidth, skyImg.naturalHeight]; skyReady = true;
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
      } catch (e) { console.warn('Sky texture unavailable', e); }
    };
    if (skyImg.complete && skyImg.naturalWidth) upSky(); else skyImg.addEventListener('load', upSky);
    return true;
  }
  const glOK = initGL();
  if (!glOK) document.body.classList.add('no-gl');

  function resize() {
    vh = innerHeight; sizeTrail();
    if (glOK) {
      const dpr = Math.min(devicePixelRatio || 1, 1.25);
      canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    measure();
  }

  /* ---------- pointer ---------- */
  // gilded dust: fine flecks of gold leaf that drift and settle
  const trail = $('#trail'), tctx = trail.getContext('2d');
  let sparks = [], lastSpark = [0, 0], tdpr = 1, lightCur = false;
  function sizeTrail() { tdpr = Math.min(devicePixelRatio || 1, 1.5); trail.width = innerWidth * tdpr; trail.height = innerHeight * tdpr; }
  function spawn(x, y, n, vx, vy) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, d = Math.random() * Math.random() * 26;
      sparks.push({
        x: x + Math.cos(a) * d, y: y + Math.sin(a) * d,
        vx: vx * .06 + (Math.random() - .5) * .5, vy: vy * .06 + (Math.random() - .5) * .5,
        r: Math.random() < .14 ? 1.8 + Math.random() * 1.6 : .55 + Math.random() * 1.1,
        life: 1, decay: .006 + Math.random() * .014, ph: Math.random() * 6.283, hue: Math.random()
      });
    }
    if (sparks.length > 700) sparks.splice(0, sparks.length - 700);
  }
  let trailDirty = false;
  function drawTrail() {
    // nothing to draw: clear once, then leave the canvas alone
    if (!sparks.length) { if (trailDirty) { tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.clearRect(0, 0, trail.width, trail.height); trailDirty = false; } return; }
    trailDirty = true;
    tctx.setTransform(tdpr, 0, 0, tdpr, 0, 0);
    tctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const s of sparks) {
      s.vx *= .97; s.vy = s.vy * .97 + .006; s.ph += .09;
      s.x += s.vx + Math.sin(s.ph) * .18; s.y += s.vy; s.life -= s.decay;
      if (s.life <= 0) continue;
      const glint = .55 + .45 * Math.sin(s.ph * 2.3);
      tctx.globalAlpha = Math.min(1, s.life * 1.4) * glint;
      tctx.fillStyle = lightCur ? (s.hue < .6 ? '#5a4326' : '#8a6f48') : (s.hue < .6 ? '#fff6e2' : s.hue < .9 ? '#ecdcb8' : '#d9c08a');
      tctx.beginPath(); tctx.arc(s.x, s.y, s.r, 0, 6.283); tctx.fill();
      // a cheap soft halo instead of a canvas shadow
      tctx.globalAlpha *= .2; tctx.beginPath(); tctx.arc(s.x, s.y, s.r * 2.8, 0, 6.283); tctx.fill();
    }
    tctx.globalAlpha = 1;
    sparks = sparks.filter(s => s.life > 0);
  }
  addEventListener('pointermove', e => {
    mouse.tx = e.clientX / innerWidth; mouse.ty = e.clientY / innerHeight;
    mouse.px = e.clientX; mouse.py = e.clientY; mouse.moved = true;
    halo.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; halo.classList.add('on');
    halo.classList.toggle('link', !!(e.target.closest && e.target.closest('a,button')));
    const d = Math.hypot(e.clientX - lastSpark[0], e.clientY - lastSpark[1]);
    if (d > 3 && !reduced && e.pointerType !== 'touch') { spawn(e.clientX, e.clientY, Math.min(9, 2 + d * .12 | 0), e.clientX - lastSpark[0], e.clientY - lastSpark[1]); lastSpark = [e.clientX, e.clientY]; }
  }, { passive: true });

  const halo = $('.star-cur');
  document.addEventListener('pointerleave', () => halo.classList.remove('on'));

  // menu
  const menuBtn = $('.menu-btn'), menu = $('#menu');
  const setMenu = on => { document.body.classList.toggle('menu-open', on); menuBtn.setAttribute('aria-expanded', on); menu.setAttribute('aria-hidden', !on); };
  menuBtn.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
  $$('a', menu).forEach(a => a.addEventListener('click', () => setMenu(false)));
  addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

  // chrome colour follows whatever section sits underneath it
  const themeAt = (x, y) => {
    for (const el of document.elementsFromPoint(x, y)) {
      if (el.closest('.top, .index, .menu')) continue;
      const t = el.closest('[data-theme]'); return t ? t.dataset.theme : 'dark';
    }
    return 'dark';
  };
  let tick = 0;

  /* ---------- manifesto words ---------- */
  const manifesto = $('[data-words]');
  (function split(node) {
    [...node.childNodes].forEach(n => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(t => {
          if (!t.trim()) { frag.appendChild(document.createTextNode(t)); return; }
          const s = document.createElement('span'); s.className = 'w'; s.textContent = t; frag.appendChild(s);
        });
        n.replaceWith(frag);
      } else split(n);
    });
  })(manifesto);
  const words = $$('.w', manifesto);

  /* ---------- reveals ---------- */
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .25 });
  $$('[data-reveal], .hello-title').forEach(el => io.observe(el));

  /* ---------- measurements ---------- */
  const hero = $('#hero'), heroCopy = $('.hero-copy'), cap1 = $('.cap-1'), cap2 = $('.cap-2'), cue = $('.scroll-cue'), note = $('.hero-note'), lines = $('.grid-lines');
  const artH = $('.ring-human .ring-art'), artA = $$('.ring-ai .ring-art'), artBoth = $('.ring-art-both');
  const inter = $('#intersection'), ringH = $('.ring-human'), ringA = $('.ring-ai'), core = $('.ring-core'), interLine = $('.inter-line');
  const acts = $$('.act'), idx = $('.index'), idxLinks = $$('.index a');
  const chapters = $$('[data-chapter]');
  const parallax = $$('[data-parallax]');
  const helloEl = $('.hello'), touchArt = $('.touch-art');
  const archState = [];
  const abStage = $('.ab-stage'), abPt = { x: 0, y: 0, tx: 0, ty: 0 };
  let abPast = false;
  const abSky = $('.with-sky img'), abPin = $('.ab-pin');
  let M = {};
  function measure() {
    const top = el => el.getBoundingClientRect().top + scrollY;
    M.hero = [top(hero), hero.offsetHeight];
    M.man = [top(manifesto), manifesto.offsetHeight];
    M.inter = [top(inter), inter.offsetHeight];
    // each card's natural position; tall cards (phones) pin once their bottom edge reaches the screen bottom
    let run = top(acts[0].parentElement);
    // (the gap after each card is its "hold": how long it stays fully readable before the next one arrives)
    M.acts = acts.map(a => { const y = run; run += a.offsetHeight + (parseFloat(getComputedStyle(a).marginBottom) || 0); a.style.top = Math.min(0, vh - a.offsetHeight) + 'px'; return y; });
    M.actH = acts[0].offsetHeight;
    M.actsEnd = top(acts[0].parentElement) + acts[0].parentElement.offsetHeight;
    M.darkEnd = top($('.acts')) + vh * .2;
    M.ch = chapters.map(c => c.classList.contains('act') ? M.acts[acts.indexOf(c)] : top(c));
  }

  /* ---------- frame ---------- */
  let t0 = performance.now(), lensAmt = 0;
  function frame(now) {
    const t = (now - t0) / 1000;
    scrollY = window.scrollY;
    mouse.x = lerp(mouse.x, mouse.tx, .09); mouse.y = lerp(mouse.y, mouse.ty, .09);
    if (!mouse.moved) { mouse.tx = .68 + Math.sin(t * .5) * .14; mouse.ty = .42 + Math.cos(t * .37) * .12; }
    drawTrail();
    if (tick++ % 5 === 0) { document.body.dataset.top = themeAt(innerWidth - 60, 34); document.body.dataset.bot = themeAt(60, vh - 60); if (mouse.moved) { const c = themeAt(mouse.px, mouse.py); lightCur = c === 'light'; document.body.dataset.cur = c; } }

    // hero
    const hp = clamp((scrollY - M.hero[0]) / (M.hero[1] - vh));
    const out = span(hp, 0, .16);
    heroCopy.style.opacity = 1 - out; heroCopy.style.transform = `translateY(${-out * 90}px)`;
    cue.style.opacity = 1 - span(hp, 0, .05); note.style.visibility = hp > .1 ? 'hidden' : 'visible';
    lines.style.opacity = .28 * (1 - span(hp, .5, .8));
    const c1 = span(hp, .24, .36) * (1 - span(hp, .52, .62));
    cap1.style.opacity = c1; cap1.style.transform = `translateY(calc(-50% + ${(1 - span(hp, .24, .62)) * 60 - 30}px))`;
    const c2 = span(hp, .68, .8) * (1 - span(hp, .93, 1));
    cap2.style.opacity = c2; cap2.style.transform = `translateY(calc(-50% + ${(1 - span(hp, .68, 1)) * 60 - 30}px))`;

    // scene
    if (glOK) {
      const visible = scrollY < M.darkEnd;
      canvas.style.visibility = visible ? 'visible' : 'hidden';
      if (visible) {
        lensAmt = lerp(lensAmt, document.body.classList.contains('loaded') ? 1 : 0, .03);
        gl.uniform2f(U.uRes, canvas.width, canvas.height);
        gl.uniform2f(U.uImg, imgSize[0], imgSize[1]);
        gl.uniform2f(U.uMouse, mouse.x, 1 - mouse.y);
        gl.uniform1f(U.uTime, reduced ? 0 : t);
        gl.uniform1f(U.uP, hp);
        gl.uniform1f(U.uLens, lensAmt);
        gl.uniform1f(U.uReady, texReady ? 1 : 0);
        skyAmt = lerp(skyAmt, skyReady ? 1 : 0, .04);
        gl.uniform1i(U.uTex, 0); gl.uniform1i(U.uSky, 1);
        gl.uniform2f(U.uSkyImg, skySize[0], skySize[1]);
        gl.uniform1f(U.uSkyReady, skyAmt);
        gl.uniform1f(U.uScroll, clamp((scrollY - M.hero[1] + vh) / (M.darkEnd - M.hero[1] + vh)));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    }

    // manifesto
    const mp = span(scrollY, M.man[0] - vh * .8, M.man[0] + M.man[1] - vh * .45);
    const lit = Math.floor(mp * (words.length + 1));
    words.forEach((w, i) => w.classList.toggle('on', i < lit));

    // intersection
    const q = clamp((scrollY - M.inter[0]) / (M.inter[1] - vh));
    const j = ease(span(q, .05, .7));
    const size = ringH.offsetHeight;
    const shift = lerp(-.22, .3, j) * size;
    ringH.style.transform = `translateX(${shift}px)`;
    ringA.style.transform = `translateX(${-shift}px)`;
    artH.style.transform = `translateX(${-shift}px)`;
    artA.forEach(a => a.style.transform = `translateX(${shift}px)`);
    artBoth.style.clipPath = `circle(${size / 2}px at ${1.3 * size - shift + (2 * shift - size / 2)}px ${size / 2}px)`;
    const k = span(q, .55, .8);
    core.style.opacity = k; core.style.transform = `translate(-50%,-50%) scale(${lerp(.6, 1, ease(k))})`;
    interLine.style.opacity = span(q, .78, .92);

    // acts stack (only while the offers are anywhere near the screen)
    const actsNear = scrollY > M.acts[0] - vh * 1.5 && scrollY < M.actsEnd + vh * .5;
    if (actsNear) {
    {
      acts.forEach((a, i) => {
        const inner = a.firstElementChild;
        const cover = i < acts.length - 1 ? clamp((scrollY + vh - M.acts[i + 1]) / vh) : 0;
        inner.style.transform = `scale(${1 - cover * .06}) translateY(${cover * -40}px)`;
        inner.style.filter = cover > 0 ? `brightness(${1 - cover * .45})` : '';
      });
    }
    // offer panels: entry progress drives the title slide, the rising arch and the focus-in
    acts.forEach((a, i) => {
      const top = a.getBoundingClientRect().top;
      const e = reduced ? 1 : clamp(1 - top / vh);
      const ee = 1 - Math.pow(1 - e, 2.2);
      a.style.setProperty('--e', ee.toFixed(4));
      if (e > .28) a.classList.add('live'); else if (e < .05) a.classList.remove('live');
      const st = archState[i];
      if (st) {
        st.rx = lerp(st.rx, st.trx, .08); st.ry = lerp(st.ry, st.try_, .08);
        st.el.style.setProperty('--rx', st.rx.toFixed(2) + 'deg'); st.el.style.setProperty('--ry', st.ry.toFixed(2) + 'deg');
      }
    });
    parallax.forEach(img => {
      const r = img.parentElement.getBoundingClientRect();
      const p = clamp((vh - r.top) / (vh + r.height));
      const e = parseFloat(img.closest('.act').style.getPropertyValue('--e')) || 0;
      const tf = `translateY(${(p - .5) * -16}%) scale(${1.04 + (1 - e) * .3})`;
      img.style.transform = tf;
      const lens = img.parentElement.querySelector('.arch-lens canvas'); if (lens) lens.style.transform = tf;
    });
    }

    // about: light scroll drift, and the cursor nudges the layers apart
    if (abStage) {
      const r = abStage.getBoundingClientRect();
      // once the portrait has scrolled away, the flowers dim so the lists below stay readable
      const past = r.bottom < vh * .5;
      if (past !== abPast) { abPast = past; abStage.closest('.with').classList.toggle('past', past); }
      if (r.top < vh && r.bottom > 0) {
        abPt.x = lerp(abPt.x, abPt.tx, .07); abPt.y = lerp(abPt.y, abPt.ty, .07);
        abStage.style.setProperty('--sp', '0');
        // scroll scene: only flowers at first, then they open up and she, the title and the bio arrive
        const pr = abPin.getBoundingClientRect();
        const ap = reduced ? 1 : clamp(-pr.top / Math.max(1, pr.height - vh));
        const open = ease(span(ap, .1, .62));
        const sec = abStage.closest('.with');
        sec.style.setProperty('--o', open.toFixed(3));
        sec.style.setProperty('--zoom', (1.06 + ap * .22).toFixed(3));
        abStage.style.setProperty('--t', ease(span(ap, .28, .56)).toFixed(3));
        abStage.style.setProperty('--m', ease(span(ap, .5, .82)).toFixed(3));
        abStage.style.setProperty('--px', abPt.x.toFixed(1) + 'px'); abStage.style.setProperty('--py', abPt.y.toFixed(1) + 'px');
        // depth: the flowers behind slide the opposite way to her
        if (abSky) { abSky.style.setProperty('--fx', (abPt.x * -1.1).toFixed(1) + 'px'); abSky.style.setProperty('--fy', (abPt.y * -1.1).toFixed(1) + 'px'); }
      }
    }

    // closing fresco drifts as you arrive
    if (touchArt) { const r = helloEl.getBoundingClientRect(); const tp = clamp((vh - r.top) / (vh + r.height)); touchArt.style.transform = `translateX(-40%) scale(${1.1 - Math.min(tp * 1.6, 1) * .1})`; }

    // index
    idx.classList.toggle('show', scrollY > M.hero[0] + M.hero[1] - vh * 1.2 && scrollY + vh < document.documentElement.scrollHeight - 160);
    let active = -1;
    M.ch.forEach((y, i) => { if (scrollY >= y - vh * .5) active = i; });
    idxLinks.forEach((l, i) => l.classList.toggle('active', i === active));

    requestAnimationFrame(frame);
  }

  /* ---------- the painting as the machine sees it ---------- */
  (function () {
    const src = $('#venus-src'), cv = $('#lines');
    const go = () => {
      try {
        const W = 1300, H = Math.round(W * src.naturalHeight / src.naturalWidth);
        cv.width = W; cv.height = H;
        const c = cv.getContext('2d', { willReadFrequently: true });
        c.drawImage(src, 0, 0, W, H);
        const d = c.getImageData(0, 0, W, H), px = d.data, L = new Float32Array(W * H);
        for (let i = 0; i < W * H; i++) L[i] = (px[i * 4] * .299 + px[i * 4 + 1] * .587 + px[i * 4 + 2] * .114) / 255;
        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          const gx = -L[i - W - 1] - 2 * L[i - 1] - L[i + W - 1] + L[i - W + 1] + 2 * L[i + 1] + L[i + W + 1];
          const gy = -L[i - W - 1] - 2 * L[i - W] - L[i - W + 1] + L[i + W - 1] + 2 * L[i + W] + L[i + W + 1];
          const e = clamp((Math.hypot(gx, gy) - .09) / .45), o = i * 4;
          px[o] = 12 + 243 * e; px[o + 1] = 14 + 200 * e; px[o + 2] = 30 + 98 * e; px[o + 3] = 255;
        }
        c.putImageData(d, 0, 0);
      } catch (e) { console.warn('Line drawing unavailable', e); }
    };
    if (src.complete && src.naturalWidth) go(); else src.addEventListener('load', go);
  })();

  /* ---------- arches: lean towards the cursor, and show what the machine sees ---------- */
  acts.forEach((a, i) => {
    const el = $('.arch', a), img = $('img', el);
    const st = archState[i] = { el, rx: 0, ry: 0, trx: 0, try_: 0 };
    if (!matchMedia('(hover:hover) and (pointer:fine)').matches) return;
    const lens = document.createElement('div'); lens.className = 'arch-lens';
    const cv = document.createElement('canvas'); lens.appendChild(cv); el.insertBefore(lens, $('figcaption', el));
    cv.style.objectPosition = getComputedStyle(img).objectPosition;
    let built = false;
    const build = () => {
      if (built || !img.complete || !img.naturalWidth) return; built = true;
      try {
        const W = Math.min(900, img.naturalWidth), H = Math.round(W * img.naturalHeight / img.naturalWidth);
        cv.width = W; cv.height = H;
        const c = cv.getContext('2d', { willReadFrequently: true });
        c.drawImage(img, 0, 0, W, H);
        const d = c.getImageData(0, 0, W, H), px = d.data, L = new Float32Array(W * H);
        for (let k = 0; k < W * H; k++) L[k] = (px[k * 4] * .299 + px[k * 4 + 1] * .587 + px[k * 4 + 2] * .114) / 255;
        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
          const k = y * W + x;
          const gx = -L[k - W - 1] - 2 * L[k - 1] - L[k + W - 1] + L[k - W + 1] + 2 * L[k + 1] + L[k + W + 1];
          const gy = -L[k - W - 1] - 2 * L[k - W] - L[k - W + 1] + L[k + W - 1] + 2 * L[k + W] + L[k + W + 1];
          const ed = clamp((Math.hypot(gx, gy) - .08) / .4), o = k * 4;
          px[o] = 10 + 245 * ed; px[o + 1] = 13 + 205 * ed; px[o + 2] = 28 + 110 * ed; px[o + 3] = 255;
        }
        c.putImageData(d, 0, 0); lens.classList.add('ready');
      } catch (err) { console.warn('Lens unavailable', err); }
    };
    el.addEventListener('pointerenter', build);
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width, ny = (e.clientY - r.top) / r.height;
      st.try_ = (nx - .5) * 12; st.trx = (.5 - ny) * 9;
      lens.style.setProperty('--mx', (nx * 100).toFixed(1) + '%'); lens.style.setProperty('--my', (ny * 100).toFixed(1) + '%');
    });
    el.addEventListener('pointerleave', () => { st.trx = 0; st.try_ = 0; });
  });

  /* ---------- about: comes alive when it arrives, portrait leans towards the cursor ---------- */
  const about = $('.ab-head');
  // signature: one letter after another, with a breath between the two names
  const sign = $('.ab-sign');
  if (sign && !reduced) {
    const text = sign.textContent; sign.textContent = ''; sign.setAttribute('aria-label', text);
    let t = 0;
    [...text].forEach(ch => {
      if (ch === ' ') { sign.appendChild(document.createTextNode(' ')); t += .32; return; }
      const s = document.createElement('span'); s.className = 'pen'; s.textContent = ch; s.setAttribute('aria-hidden', 'true');
      const dur = /[A-Z]/.test(ch) ? .42 : .2;
      s.style.setProperty('--d', t.toFixed(2) + 's'); s.style.setProperty('--t', dur + 's');
      t += dur * .82; sign.appendChild(s);
    });
  }
  if (about) {
    if (reduced) about.classList.add('live');
    else {
      // plays once, quickly, the first time the section is reached
      const io2 = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { about.classList.add('live'); io2.disconnect(); } }), { threshold: .3 });
      io2.observe($('.ab-bio'));
    }
    // the whole section listens, so the depth responds wherever the mouse is
    const abSection = abStage.closest('.with');
    abSection.addEventListener('pointermove', e => {
      abPt.tx = (e.clientX / innerWidth - .5) * 26; abPt.ty = (e.clientY / innerHeight - .5) * 16;
    });
    abSection.addEventListener('pointerleave', () => { abPt.tx = 0; abPt.ty = 0; });
  }

  /* ---------- closing: "Get in touch" opens out of the spark between the fingers ---------- */
  const helloBody = $('.hello-body'), spark = $('.touch-spark');
  if (helloBody && spark && !reduced) {
    const io3 = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      const a = spark.getBoundingClientRect(), restTop = helloEl.getBoundingClientRect().top + helloBody.offsetTop;
      helloBody.style.setProperty('--sy', Math.round(a.top + a.height / 2 - restTop) + 'px');
      requestAnimationFrame(() => requestAnimationFrame(() => helloEl.classList.add('live')));
      io3.disconnect();
    }), { threshold: .55 });
    io3.observe(helloEl);
  } else if (helloEl) helloEl.classList.add('live');

  /* ---------- magnetic buttons ---------- */
  $$('.cta, .pill').forEach(b => {
    b.addEventListener('pointermove', e => {
      const r = b.getBoundingClientRect();
      b.style.translate = `${(e.clientX - r.left - r.width / 2) * .2}px ${(e.clientY - r.top - r.height / 2) * .3}px`;
    });
    b.addEventListener('pointerleave', () => b.style.translate = '');
  });

  new ResizeObserver(() => measure()).observe(document.body);
  addEventListener('resize', resize);
  addEventListener('load', resize);
  resize();
  requestAnimationFrame(frame);
})();
