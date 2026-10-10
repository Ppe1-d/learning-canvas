export const W=320,H=240;
export function isVisible(n,pan,zoom,width,height){const margin=180;return (n.x+W)*zoom+pan.x>-margin&&n.x*zoom+pan.x<width+margin&&(n.y+H)*zoom+pan.y>-margin&&n.y*zoom+pan.y<height+margin;}
export function ports(a,b,direction){return direction==='vertical'?{from:[a.x+W/2,a.y+H],to:[b.x+W/2,b.y]}:{from:[a.x+W,a.y+H/2],to:[b.x,b.y+H/2]};}
const vectors={left:[-1,0],right:[1,0],top:[0,-1],bottom:[0,1]};
function sidePair(a,b,direction){const dx=b.x-a.x,dy=b.y-a.y;
 if(Math.abs(dx)>=W+40&&(Math.abs(dy)<H+40||Math.abs(dx)/W>=Math.abs(dy)/H))return dx>=0?['right','left']:['left','right'];
 if(Math.abs(dy)>=H+40)return dy>=0?['bottom','top']:['top','bottom'];
 return direction==='vertical'?(dy>=0?['bottom','top']:['top','bottom']):(dx>=0?['right','left']:['left','right']);
}
function anchor(node,side,offset){if(side==='left'||side==='right')return [node.x+(side==='right'?W:0),node.y+H/2+offset];return [node.x+W/2+offset,node.y+(side==='bottom'?H:0)];}
function inside(p,r){return p[0]>r.l+.001&&p[0]<r.r-.001&&p[1]>r.t+.001&&p[1]<r.b-.001;}
function blocked(a,b,rects){return rects.some(r=>a[0]===b[0]?a[0]>r.l+.001&&a[0]<r.r-.001&&Math.max(a[1],b[1])>r.t+.001&&Math.min(a[1],b[1])<r.b-.001:a[1]>r.t+.001&&a[1]<r.b-.001&&Math.max(a[0],b[0])>r.l+.001&&Math.min(a[0],b[0])<r.r-.001);}
class Heap{items=[];push(v){let i=this.items.length;this.items.push(v);while(i){const p=(i-1)>>1;if(this.items[p].f<=v.f)break;this.items[i]=this.items[p];i=p;}this.items[i]=v;}pop(){const result=this.items[0],last=this.items.pop();if(this.items.length){let i=0;while(i*2+1<this.items.length){let c=i*2+1;if(c+1<this.items.length&&this.items[c+1].f<this.items[c].f)c++;if(this.items[c].f>=last.f)break;this.items[i]=this.items[c];i=c;}this.items[i]=last;}return result;}}
function orthogonal(start,end,rects,padding){
 const l=Math.min(start[0],end[0])-padding,r=Math.max(start[0],end[0])+padding,t=Math.min(start[1],end[1])-padding,b=Math.max(start[1],end[1])+padding;
 const local=rects.filter(v=>v.r>=l&&v.l<=r&&v.b>=t&&v.t<=b);
 const xs=[...new Set([l,r,start[0],end[0],...local.flatMap(v=>[v.l,v.r]).filter(x=>x>=l&&x<=r)])].sort((a,b)=>a-b),ys=[...new Set([t,b,start[1],end[1],...local.flatMap(v=>[v.t,v.b]).filter(y=>y>=t&&y<=b)])].sort((a,b)=>a-b);
 const nx=xs.length,point=id=>[xs[id%nx],ys[Math.floor(id/nx)]],index=p=>ys.indexOf(p[1])*nx+xs.indexOf(p[0]),s=index(start),goal=index(end),heap=new Heap(),costs=new Map(),previous=new Map(),valid=new Map();
 const usable=id=>{if(!valid.has(id))valid.set(id,!local.some(v=>inside(point(id),v)));return valid.get(id);};
 if(!usable(s)||!usable(goal))return null;
 const heuristic=id=>{const p=point(id);return Math.abs(p[0]-end[0])+Math.abs(p[1]-end[1]);};
 heap.push({id:s,dir:0,key:s*3,g:0,f:heuristic(s)});costs.set(s*3,0);
 while(heap.items.length){const cur=heap.pop();if(cur.g!==costs.get(cur.key))continue;if(cur.id===goal){const out=[];let key=cur.key;while(key!==undefined){out.push(point(Math.floor(key/3)));key=previous.get(key);}return out.reverse();}
  const x=cur.id%nx,y=Math.floor(cur.id/nx);const neighbors=[];if(x)neighbors.push([cur.id-1,1]);if(x<nx-1)neighbors.push([cur.id+1,1]);if(y)neighbors.push([cur.id-nx,2]);if(y<ys.length-1)neighbors.push([cur.id+nx,2]);
  for(const [id,dir] of neighbors){if(!usable(id)||blocked(point(cur.id),point(id),local))continue;const p=point(id),q=point(cur.id),g=cur.g+Math.abs(p[0]-q[0])+Math.abs(p[1]-q[1])+(cur.dir&&cur.dir!==dir?25:0),key=id*3+dir;if(g>=(costs.get(key)??Infinity))continue;costs.set(key,g);previous.set(key,cur.key);heap.push({id,dir,key,g,f:g+heuristic(id)});}
 }return null;
}
function simplify(points){const out=[];for(const p of points){if(out.length&&p[0]===out.at(-1)[0]&&p[1]===out.at(-1)[1])continue;while(out.length>1){const a=out.at(-2),b=out.at(-1);if((b[0]-a[0])*(p[1]-b[1])!==(b[1]-a[1])*(p[0]-b[0]))break;out.pop();}out.push(p);}return out;}
function rounded(points){let d=`M ${points[0].join(' ')}`;for(let i=1;i<points.length-1;i++){const a=points[i-1],p=points[i],b=points[i+1],l1=Math.hypot(p[0]-a[0],p[1]-a[1]),l2=Math.hypot(b[0]-p[0],b[1]-p[1]),r=Math.min(32,l1/2,l2/2);const before=[p[0]-(p[0]-a[0])*r/l1,p[1]-(p[1]-a[1])*r/l1],after=[p[0]+(b[0]-p[0])*r/l2,p[1]+(b[1]-p[1])*r/l2];d+=` L ${before.join(' ')} Q ${p.join(' ')} ${after.join(' ')}`;}return d+` L ${points.at(-1).join(' ')}`;}
export function buildRoutes(nodes,direction='horizontal'){
 const byId=new Map(nodes.map(n=>[n.id,n])),edges=[],groups=new Map();
 for(const n of nodes)for(const id of n.parents??[]){const a=byId.get(id);if(!a)continue;const [fromSide,toSide]=sidePair(a,n,direction);const edge={source:id,target:n.id,kind:n.kind,from:{node:id,side:fromSide},to:{node:n.id,side:toSide}};edges.push(edge);for(const [end,other] of [[edge.from,n],[edge.to,a]]){const key=end.node+':'+end.side;if(!groups.has(key))groups.set(key,[]);groups.get(key).push({end,other});}}
 for(const group of groups.values()){group.sort((a,b)=>['left','right'].includes(a.end.side)?a.other.y-b.other.y:a.other.x-b.other.x);const length=['left','right'].includes(group[0].end.side)?H:W,step=Math.min(22,(length-48)/Math.max(1,group.length-1));group.forEach((v,i)=>{v.end.point=anchor(byId.get(v.end.node),v.end.side,(i-(group.length-1)/2)*step);});}
 const rects=nodes.map(n=>({l:n.x-16,r:n.x+W+16,t:n.y-16,b:n.y+H+16}));
 for(const edge of edges){const start=edge.from.point,end=edge.to.point,v=vectors[edge.from.side],w=vectors[edge.to.side],s=[start[0]+v[0]*28,start[1]+v[1]*28],e=[end[0]+w[0]*28,end[1]+w[1]*28];
  const others=nodes.filter(n=>n.id!==edge.source&&n.id!==edge.target).map(n=>({l:n.x,r:n.x+W,t:n.y,b:n.y+H}));
  const distance=Math.hypot(end[0]-start[0],end[1]-start[1]),handle=Math.min(160,Math.max(40,distance*.35)),cp1=[start[0]+v[0]*handle,start[1]+v[1]*handle],cp2=[end[0]+w[0]*handle,end[1]+w[1]*handle],samples=[],steps=Math.max(40,Math.ceil(distance/10));
  for(let i=0;i<=steps;i++){const t=i/steps,u=1-t;samples.push([u*u*u*start[0]+3*u*u*t*cp1[0]+3*u*t*t*cp2[0]+t*t*t*end[0],u*u*u*start[1]+3*u*u*t*cp1[1]+3*u*t*t*cp2[1]+t*t*t*end[1]]);}
  const curveRects=nodes.map(n=>{const pad=n.id===edge.source||n.id===edge.target?0:12;return {l:n.x-pad,r:n.x+W+pad,t:n.y-pad,b:n.y+H+pad};});
  if(!samples.some(p=>curveRects.some(r=>inside(p,r)))){edge.points=samples;edge.path=`M ${start.join(' ')} C ${cp1.join(' ')}, ${cp2.join(' ')}, ${end.join(' ')}`;continue;}
  let points=null;for(const padding of [90,300,900]){points=orthogonal(s,e,rects,padding);if(points)break;}
  if(!points||blocked(start,s,others)||blocked(e,end,others)){edge.blocked=true;edge.points=[start,end];edge.path='';continue;}
  edge.points=simplify([start,...points,end]);edge.path=rounded(edge.points);
 }
 return edges;
}
export function edgePath(a,b,direction,nodes=[]){const list=nodes.length?nodes:[a,b];const copy=list.map(n=>({...n,parents:n.id===b.id?[a.id]:[]}));return buildRoutes(copy,direction)[0]?.path||'';}
export function arrange(nodes,direction='horizontal'){
 const depths=new Map(),pending=[...nodes];
 while(pending.length){const i=pending.findIndex(n=>n.parents.every(id=>depths.has(id)||!nodes.some(p=>p.id===id)));if(i<0)throw Error('节点引用存在循环，无法整理');const [n]=pending.splice(i,1);depths.set(n.id,Math.max(-1,...n.parents.map(id=>depths.get(id)??-1))+1);}
 const occupied=new Map(),lanes=new Map();
 const sorted=[...nodes].sort((a,b)=>depths.get(a.id)-depths.get(b.id)||(a.kind==='main'?-1:1)-(b.kind==='main'?-1:1));
 const positions=new Map();for(const n of sorted){const depth=depths.get(n.id);let lane=n.kind==='main'?0:Math.max(1,...n.parents.map(id=>lanes.get(id)??1));const used=occupied.get(depth)??new Set();while(used.has(lane))lane++;used.add(lane);occupied.set(depth,used);lanes.set(n.id,lane);positions.set(n.id,direction==='vertical'?{x:60+lane*420,y:60+depth*340}:{x:60+depth*440,y:60+lane*340});}
 return nodes.map(n=>({...n,...positions.get(n.id)}));
}
