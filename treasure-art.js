// Original pixel sprites. Each drawing has a shell, independently hinged lid,
// and a power-specific relic. Coordinates share an integer grid, not a bitmap.
const ns = 'http://www.w3.org/2000/svg';
function node(parent, tag, attrs) {
  const item = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attrs)) item.setAttribute(key, value);
  parent.append(item);
  return item;
}
const group = (g, cls) => node(g, 'g', {class:cls});
const path = (g, fill, d) => node(g, 'path', {fill,d});
const rect = (g, fill, x, y, width, height) => node(g, 'rect', {fill,x,y,width,height});

// Fill the sprite on a logical pixel grid before scaling. This keeps diagonal
// steps square even when the SVG is shown at a fractional size in the modal.
function pixelLayer(parent, draw) {
  const w=88, h=78, rows=Array.from({length:h},()=>Array(w));
  const dot=(x,y,color)=>{if(x>=0 && y>=0 && x<w && y<h) rows[y][x]=color;};
  const line=(a,b,color)=>{
    let [x,y]=a.map(Math.round);
    const [endX,endY]=b.map(Math.round), dx=Math.abs(endX-x), dy=-Math.abs(endY-y);
    const sx=x<endX?1:-1, sy=y<endY?1:-1;
    for(let err=dx+dy;;) {
      dot(x,y,color); if(x===endX && y===endY) break;
      const twice=2*err;
      if(twice>=dy){err+=dy;x+=sx;}
      if(twice<=dx){err+=dx;y+=sy;}
    }
  };
  const trace=(points,color)=>points.slice(1).forEach((p,i)=>line(points[i],p,color));
  const poly=(points,fill,edge=fill)=>{
    const ys=points.map(p=>p[1]);
    for(let y=Math.max(0,Math.floor(Math.min(...ys)));y<=Math.min(h-1,Math.ceil(Math.max(...ys)));y++){
      const scan=y+.5, hits=[];
      points.forEach(([x1,y1],i)=>{
        const [x2,y2]=points[(i+1)%points.length];
        if((y1<=scan && scan<y2)||(y2<=scan && scan<y1)) hits.push(x1+(scan-y1)*(x2-x1)/(y2-y1));
      });
      hits.sort((a,b)=>a-b);
      for(let i=0;i+1<hits.length;i+=2)
        for(let x=Math.ceil(hits[i]-.5);x<hits[i+1]-.5;x++) dot(x,y,fill);
    }
    trace([...points,points[0]],edge);
  };
  draw(poly,trace);
  const paths=new Map();
  rows.forEach((row,y)=>{
    for(let x=0;x<w;){
      const start=x, color=row[x++];
      while(x<w && row[x]===color) x++;
      if(color) paths.set(color,(paths.get(color)||'')+`M${start} ${y}h${x-start}v1H${start}Z`);
    }
  });
  for(const [color,d] of paths) path(parent,color,d);
}

const metals={
  wood:{ink:'#271a1b',deep:'#542738',dark:'#774132',mid:'#a36543',light:'#c78b51',glow:'#ffe99a',trim:'#ffc54f',shade:'#c98532',under:'#975421'},
  iron:{ink:'#182337',deep:'#25364d',dark:'#34495e',mid:'#526b80',light:'#839baf',glow:'#e2f3f8',trim:'#b2c9d5',shade:'#718e9f',under:'#486374'},
  gold:{ink:'#352035',deep:'#49253f',dark:'#693351',mid:'#954968',light:'#c07876',glow:'#fff1a1',trim:'#ffcc4e',shade:'#d88c33',under:'#a45c28'},
};

function coffer(body,lid,lining,clasp,well,id) {
  const iron=id==='iron', gold=id==='gold', c=metals[id];
  const width=iron?42:gold?38:39, depth=iron?21:24, base=iron?19:21;
  const ox=(88-width+depth)/2, oy=iron?68:71;
  const at=(x,u,z)=>[ox+x-u,oy-(x+u)*.43-z];
  const front=(coords,u=0)=>coords.map(([x,z])=>at(x,u,z));
  const side=(coords,x=0)=>coords.map(([u,z])=>at(x,u,z));
  const strip=(x1,x2,u1,z1,u2,z2)=>[at(x1,u1,z1),at(x2,u1,z1),at(x2,u2,z2),at(x1,u2,z2)];
  // Profiles run from the rear hinge across the crown to the front seam.
  const arch=iron?[[depth,0],[depth,5],[17,10],[5,10],[0,5],[0,0]]:
             gold?[[depth,0],[depth,6],[22,11],[17,16],[13,18],[9,17],[4,14],[1,9],[0,4],[0,0]]:
                  [[depth,0],[depth,5],[22,10],[18,14],[14,16],[10,16],[6,14],[3,11],[1,7],[0,3],[0,0]];
  const curve=(x,offset=0)=>arch.map(([u,z])=>at(x,u,base+z+offset));
  const band=(p,l,a,b)=>{
    arch.slice(1).forEach(([u,z],i)=>{
      const [pu,pz]=arch[i];
      p(strip(a,b,pu,base+pz,u,base+z),pu>depth*.55?c.trim:(pz===z?c.glow:c.shade));
    });
    l(curve(a),c.under); l(curve(b),c.ink);
    l(curve(a+1).slice(1,-3),c.glow);
  };

  pixelLayer(body,(p,l)=>{
    p(side([[0,0],[depth,0],[depth,base],[0,base]]),c.shade,c.ink);
    p(side([[3,4],[depth-3,4],[depth-3,base-3],[3,base-3]]),c.deep,c.ink);
    for(const u of [6,12,18]) l(side([[u,5],[u,base-4]]),c.dark);
    l(side([[depth-1,2],[1,2],[1,base-2]]),c.trim);
    p(front([[0,0],[width,0],[width,base],[0,base]]),c.trim,c.ink);
    p(front([[4,4],[width-4,4],[width-4,base-3],[4,base-3]]),c.dark,c.ink);
    if(iron) {
      p(front([[5,7],[8,4],[width-9,4],[width-5,8],[width-5,base-5],[5,base-5]]),c.mid,c.under);
      for(const x of [5,width-6]) for(const z of [4,base-3]) l(front([[x,z],[x+1,z+1]]),c.glow);
      p(side([[5,5],[depth-4,5],[depth-4,base-4],[5,base-4]]),c.mid,c.ink);
      l(side([[7,8],[8,12],[15,12],[16,8]]),c.ink);
      l(side([[8,9],[9,11],[14,11]]),c.trim);
    } else if(gold) {
      for(const x of [5,width-15]){
        p(front([[x,base-4],[x+5,base-10],[x+10,base-4],[x+7,base-4],[x+5,base-7],[x+3,base-4]]),c.shade);
      }
      l(side([[5,8],[11,14],[17,8],[11,6],[5,8]]),c.trim);
      l(front([[3,3],[width-3,3],[width-3,base-2]]),c.glow);
    } else {
      for(const z of [8,13]) {
        l(front([[5,z],[width-5,z]]),c.deep);
        l(front([[6,z+1],[width-6,z+1]]),c.mid);
      }
      l(front([[6,5],[12,5]]),c.light);
    }
    l(front([[1,2],[1,base-1]]),c.glow);
  });
  pixelLayer(lid,(p,l)=>{
    // Long slats first, raised end hoops second, near arched end last.
    for(let i=0;i<arch.length-1;i++){
      const [u,z]=arch[i], [v,h]=arch[i+1];
      const tint=u>depth*.72?c.dark:u>depth*.38?c.light:u>depth*.16?c.mid:c.dark;
      p(strip(0,width,u,base+z,v,base+h),tint);
      if([1,3,6,8].includes(i)) l([at(0,u,base+z),at(width,u,base+z)],c.deep);
    }
    // Trace the visible crest, not the hidden rear seam through the roof.
    const [crestU,crestZ]=arch.reduce((a,b)=>a[1]+a[0]*.43>b[1]+b[0]*.43?a:b);
    l([at(0,crestU,base+crestZ),at(width,crestU,base+crestZ)],c.ink);
    l(curve(width),c.ink);
    if(id==='wood') {
      l([at(8,9,base+15),at(16,9,base+15)],c.light);
      l([at(21,4,base+12),at(28,4,base+12)],c.light);
    }
    band(p,l,width-(iron?4:6),width);
    if(iron) {
      band(p,l,16,19);
      p([at(12,7,base+11),at(29,7,base+11),at(29,7,base+14),at(26,7,base+16),at(15,7,base+16),at(12,7,base+14)],c.shade,c.ink);
      l([at(15,7,base+12),at(16,7,base+14),at(25,7,base+14),at(26,7,base+12)],c.ink);
      l([at(16,7,base+16),at(25,7,base+16)],c.glow);
    }
    band(p,l,0,iron?4:6);
    p(curve(0),c.trim,c.ink);
    const inner=arch.map(([u,z])=>at(0,3+u*(depth-6)/depth,base+1+z*.66));
    p(inner,c.deep,c.under);
    for(const u of [7,12,17]) l(side([[u,base+2],[u,base+(iron?5:u===12?9:6)]]),c.dark);
    l(curve(0).slice(1,-4),c.glow);
    p(strip(0,width,0,base,0,base+2),c.shade,c.ink);
    l([at(2,0,base+2),at(width-2,0,base+2)],c.trim);
    if(gold) {
      const x=width*.55,u=12,z=base+17;
      const emblem=points=>points.map(([a,b])=>at(x+a,u,z+b));
      p(emblem([[-6,0],[-8,7],[-4,5],[-2,8],[0,5],[3,10],[5,3],[7,6],[6,0]]),c.trim,c.ink);
      l(emblem([[-5,1],[5,1]]),c.glow);
      p(emblem([[-1,2],[-2,4],[0,6],[2,4],[1,2]]),'#ee9176',c.under);
    }
  });
  pixelLayer(lining,(p,l)=>{
    const panel=(x,z)=>at(x,depth+z*.13,base+z);
    const face=(v)=>v.map(([x,z])=>panel(x,z));
    const height=iron?12:15;
    p(face([[0,0],[width,0],[width,height-2],[width-2,height],[2,height],[0,height-2]]),c.trim,c.ink);
    p(face([[3,2],[width-3,2],[width-3,height-3],[3,height-3]]),c.deep,c.under);
    l(face([[4,4],[width-4,4]]),c.dark);
    l(face([[3,height-1],[width-4,height-1]]),c.glow);
    p(face([[width/2-3,height-2],[width/2+3,height-2],[width/2+3,height+1],[width/2-3,height+1]]),c.shade,c.ink);
  });
  pixelLayer(well,(p,l)=>{
    const rim=(inset)=>[at(inset,inset,base),at(width-inset,inset,base),at(width-inset,depth-inset,base),at(inset,depth-inset,base)];
    p(rim(0),c.trim,c.ink); p(rim(3),c.deep,c.ink);
    l([at(3,depth-3,base),at(3,3,base),at(width-3,3,base)],c.shade);
  });
  pixelLayer(clasp,(p,l)=>{
    const x=Math.round(width*.53), plate=a=>a.map(([a,b])=>at(x+a,-1,base+b));
    if(iron){
      p(plate([[-7,1],[-5,4],[5,4],[7,2],[7,-4],[5,-6],[-5,-6],[-7,-4]]),c.shade,c.ink);
      p(plate([[-5,-1],[5,-1],[5,1],[-5,1]]),'#79d6da',c.deep);
      l(plate([[-3,2],[3,2]]),c.glow);
    } else if(gold){
      p(plate([[-6,1],[-4,5],[0,7],[5,4],[6,0],[0,-9]]),c.trim,c.ink);
      p(plate([[-4,1],[0,5],[4,2],[4,-1],[0,-6]]),'#9a4cba',c.deep);
      p(plate([[-3,1],[0,4],[0,0],[0,-4]]),'#e4a6f0');
    } else {
      p(plate([[-4,3],[-2,5],[3,5],[5,3],[5,-4],[3,-7],[-2,-7],[-4,-5]]),c.trim,c.ink);
      p(plate([[-1,1],[1,2],[2,1],[2,-1],[1,-2],[1,-4],[-1,-4],[-1,-1],[-2,0]]),c.ink);
      l(plate([[-3,1],[-3,3],[1,4]]),c.glow);
    }
  });
}

function drawRelic(charm, id) {
  if (id === 'wood') {
    path(charm,'#842f20','M43 6H47V11H50V14H52V20H50V24H46V26H41V24H38V21H36V16H39V18H40V12H43Z');
    path(charm,'#ff963d','M44 10H46V14H49V17H50V20H48V23H41V21H39V17H42V15H44Z');
    path(charm,'#fff1a1','M44 16H46V19H48V21H46V23H43V21H42V19H44Z');
  } else if (id === 'iron') {
    path(charm,'#202b39','M43 6H46V8H52V16H50V20H48V22H46V24H43V22H40V20H38V17H36V8H43Z');
    path(charm,'#39bfcf','M43 9H46V10H50V16H48V19H46V21H43V19H41V17H39V10H43Z');
    path(charm,'#d6fffb','M43 10H45V12H42V17H40V11H43Z'); rect(charm,'#288293',45,13,3,5);
  } else {
    path(charm,'#95551c','M42 5H46V10H49V12H54V16H50V19H48V24H45V22H42V24H39V20H38V18H35V12H40V10H42Z');
    path(charm,'#ffe572','M43 8H45V12H48V14H51V16H48V18H46V21H44V19H42V21H41V17H38V14H42V12H43Z');
    rect(charm,'#fff2b5',43,13,3,3);
  }
}

export function chestArt(chest, opened) {
  const stage = document.createElement('div');
  stage.className='lb-chest-art'; stage.dataset.open=String(opened); stage.setAttribute('aria-hidden','true');
  const svg = node(stage,'svg',{viewBox:'0 0 88 78','shape-rendering':'crispEdges',focusable:'false'});
  const chestGroup=group(group(svg,'lb-chest-entry'),'lb-chest-object');
  path(chestGroup,'var(--case-shadow)','M11 64H20V62H53V60H73V61H79V65H73V67H59V69H44V72H32V71H22V69H14V67H11Z');
  const lining=group(chestGroup,'lb-chest-lining');
  const body=group(chestGroup,'lb-chest-body');
  path(chestGroup,'var(--case-trim)','M31 43L22 12L37 20L44 4L50 18L65 11L57 43Z').setAttribute('class','lb-chest-light');
  const well=group(chestGroup,'lb-chest-well');
  const lid=group(chestGroup,'lb-chest-lid');
  const charm=group(svg,'lb-chest-relic');
  coffer(body,lid,lining,group(chestGroup,'lb-chest-clasp'),well,chest.id);
  drawRelic(charm,chest.id);
  const sparks=group(svg,'lb-loot-sparks');
  for(const [x,y] of [[26,23],[61,16],[30,10],[57,29],[36,5],[54,7]]) {
    path(sparks,'var(--case-trim)', 'M'+x+' '+y+'h2v2h2v2h-2v2h-2v-2h-2v-2h2Z');
  }
  return stage;
}
