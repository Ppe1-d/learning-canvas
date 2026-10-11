// Mainline changes move a pointer; saved answers and descendant snapshots stay intact.
function find(state,id){const node=state.nodes.find(n=>n.id===id);if(!node||node.kind!=='main')throw Error('请选择主线节点');return node;}
function remember(state){state.mainPaths=[...new Set([...(state.mainPaths||[]),state.mainHead].filter(Boolean))];state.mainSelection=true;}
export function candidateOrigin(state,id){const node=find(state,id);return {replacementOf:node.replacementOf||id,parents:[...node.parents],context:structuredClone(node.context)};}
export function selectMainline(state,id){const node=find(state,id);if(!['complete','imported'].includes(node.status))throw Error('候选回答完成后才能选为主线');remember(state);state.mainHead=id;}
export function excludeMainline(state,id){const node=find(state,id),head=state.nodes.find(n=>n.id===state.mainHead);if(!head||![...head.context.turns.map(t=>t.id),head.id].includes(id))throw Error('该节点不在当前主线路径上');remember(state);state.mainHead=node.parents[0]||null;}

