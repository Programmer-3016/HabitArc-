// Public preview roster only. Never fetch or compare private habit documents here.
const runners = [
  ['mintfox','arcy',410,3320], ['zenpanda','ninja',385,2480],
  ['nightowl_k','astro',372,2790], ['Sarthak','specops',350,1580],
  ['riya.runs','astro',340,1650], ['codekarma','ninja',318,1420],
  ['aarav_09','arcy',296,910], ['lofi.lena','specops',262,1180],
];
export function standings(period){
  const column=period==='allTime'?3:2;
  return runners.map(r=>({name:r[0],hero:r[1],points:r[column],self:r[0]==='Sarthak'}))
    .sort((a,b)=>b.points-a.points||a.name.localeCompare(b.name))
    .map((r,i)=>({...r,rank:i+1}));
}
const format=new Intl.NumberFormat('en');
function el(tag,cls,txt){
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(txt!==undefined)node.textContent=txt;
  return node;
}
function sprite(hero,pose){
  const img=el('img');img.alt='';
  const frames=window.HabitArcSprites?.[hero];
  const src=(frames?.[pose]||frames?.run0)?.src;
  if(src)img.src=src;
  return img;
}
const mounted=new WeakSet();
export async function mountLeaderboard(root){
  if(!root.isConnected || mounted.has(root))return;
  if(!window.HabitArcSprites)await import('./companion-sprites.js');
  if(!root.isConnected || mounted.has(root))return;
  mounted.add(root);
  const find=id=>root.querySelector('#'+id);
  const buttons=root.querySelectorAll('[data-period]');
  function draw(period,announce){
    const list=standings(period);
    const mine=list.find(r=>r.self), gap=mine.rank===1?0:list[mine.rank-2].points-mine.points;
    const slot=r=>{
      const lane=el('div','lb-lane'),step=el('div','lb-plinth');
      lane.dataset.rank=r.rank;
      step.append(el('b',null,String(r.rank).padStart(2,'0')),el('strong',null,r.name));
      lane.append(sprite(r.hero,'cheer'),step);return lane;
    };
    find('podium').replaceChildren(...[list[1],list[0],list[2]].map(slot));
    find('entries').replaceChildren(...list.map(r=>{
      const tr=el('tr'), nameCell=el('td'),wrap=el('div','lb-runner'), avatar=el('span','lb-pic');
      avatar.append(sprite(r.hero,'run0'));wrap.append(avatar,el('span',null,r.name));
      if(r.self){tr.className='lb-mine';tr.tabIndex=-1;wrap.append(el('small','lb-you','You'));}
      nameCell.append(wrap);
      tr.append(el('td','lb-rank',String(r.rank).padStart(2,'0')),nameCell,el('td','lb-pts',format.format(r.points)));
      return tr;
    }));
    find('self-rank').textContent='#'+mine.rank;
    find('self-gap').textContent=gap?format.format(mine.points)+' pts · '+format.format(gap)+' pts behind #'+(mine.rank-1):'Leading the league';
    find('roster').textContent=list.length+' demo runners';
    buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.period===period)));
    if(announce)find('announcement').textContent=(period==='weekly'?'Weekly':'All-time')+' standings. Your demo rank is '+mine.rank+' of '+list.length+'.';
  }
  buttons.forEach(b=>b.addEventListener('click',()=>draw(b.dataset.period,true)));
  find('find-me').addEventListener('click',()=>{
    const row=root.querySelector('.lb-mine');
    row.focus({preventScroll:true});
    row.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  });
  draw('weekly',false);
}
