const escape=text=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function inline(text){
 const pattern=/(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^\s)]+\))/g;let html='',start=0;
 for(const match of text.matchAll(pattern)){html+=escape(text.slice(start,match.index));const token=match[0];
  if(token.startsWith('`'))html+='<code>'+escape(token.slice(1,-1))+'</code>';
  else if(token.startsWith('**'))html+='<strong>'+escape(token.slice(2,-2))+'</strong>';
  else{const [,label,url]=token.match(/^\[([^\]]+)\]\((.+)\)$/);html+=/^https?:\/\//i.test(url)?`<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>`:escape(label);}
  start=match.index+token.length;
 }return html+escape(text.slice(start));
}
export function markdown(text){
 const lines=text.replace(/\r\n/g,'\n').split('\n');let out='',paragraph=[],list=null;
 const flush=()=>{if(paragraph.length){out+='<p>'+inline(paragraph.join('\n')).replace(/\n/g,'<br>')+'</p>';paragraph=[];}if(list){out+=`</${list}>`;list=null;}};
 for(let i=0;i<lines.length;i++){const line=lines[i];
  if(/^\s*```/.test(line)){flush();const language=line.trim().slice(3).trim();let code=[];while(++i<lines.length&&!/^\s*```/.test(lines[i]))code.push(lines[i]);out+=`<pre><code aria-label="${escape(language||'代码')}">${escape(code.join('\n'))}</code></pre>`;continue;}
  if(!line.trim()){flush();continue;}
  if(line.includes('|')&&/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i+1]||'')){
   flush();const cells=row=>row.trim().replace(/^\||\|$/g,'').split('|').map(c=>inline(c.trim()));
   out+='<div class="table-wrap"><table><thead><tr>'+cells(line).map(c=>'<th>'+c+'</th>').join('')+'</tr></thead><tbody>';i++;
   while(i+1<lines.length&&lines[i+1].includes('|')&&lines[i+1].trim()){out+='<tr>'+cells(lines[++i]).map(c=>'<td>'+c+'</td>').join('')+'</tr>';}
   out+='</tbody></table></div>';continue;
  }
  const heading=line.match(/^(#{1,6})\s+(.+)$/);if(heading){flush();const level=Math.min(6,heading[1].length+1);out+=`<h${level}>${inline(heading[2])}</h${level}>`;continue;}
  const item=line.match(/^\s*(?:[-*+]\s+|(\d+)\.\s+)(.+)$/);if(item){const kind=item[1]?'ol':'ul';if(list!==kind){flush();out+=`<${kind}>`;list=kind;}out+='<li>'+inline(item[2])+'</li>';continue;}
  if(/^>\s?/.test(line)){flush();out+='<blockquote>'+inline(line.replace(/^>\s?/,''))+'</blockquote>';continue;}
  if(list)flush();paragraph.push(line);
 }flush();return out;
}
