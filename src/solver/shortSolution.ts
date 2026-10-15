import {applyMoves,inverseMove,moveFacelets,SOLVED} from '../core/cube';
import {FACES,Move} from '../core/types';

// The UI verifies individual 90-degree turns, so every edge has cost one.
// A half turn is two edges, rather than a single cheaper search move.
const turns=FACES.flatMap(f=>[f,`${f}'`] as Move[]);
const radius=3;
let nearSolved:Map<string,readonly Move[]>|undefined;
function solvedNeighborhood():Map<string,readonly Move[]> {
  if(nearSolved)return nearSolved;
  const paths=new Map<string,readonly Move[]>([[SOLVED,[]]]);
  let frontier=[SOLVED];
  for(let depth=1;depth<=radius;depth++){
    const next:string[]=[];
    for(const state of frontier)for(const move of turns){
      const after=moveFacelets(state,move);
      if(paths.has(after))continue;
      // Store a shortest route BACK to solved, not the generation scramble.
      paths.set(after,[inverseMove(move),...paths.get(state)!]);next.push(after);
    }
    frontier=next;
  }
  nearSolved=paths;return paths;
}

/** Exact shortest solution when at most six quarter turns from solved.
 * Both breadth-first neighborhoods have radius three (1,195 states each),
 * bounding memory and work even for a fully scrambled input.
 */
export function shortSolution(facelets:string):Move[]|undefined {
  const solved=solvedNeighborhood(),direct=solved.get(facelets);
  if(direct)return [...direct];
  const visited=new Set([facelets]);
  let frontier:{state:string;path:Move[]}[]=[{state:facelets,path:[]}];
  for(let depth=1;depth<=radius;depth++){
    const next:typeof frontier=[];
    for(const {state,path} of frontier)for(const move of turns){
      const after=moveFacelets(state,move);
      if(visited.has(after))continue;
      visited.add(after);
      const prefix=[...path,move],tail=solved.get(after);
      // No intersection at an earlier BFS layer means this first intersection
      // is a globally shortest route, including within the quarter-turn metric.
      if(tail)return [...prefix,...tail];
      if(depth<radius)next.push({state:after,path:prefix});
    }
    frontier=next;
  }
  return undefined;
}

/** Remove detours from a longer verified plan using exact short equivalents.
 * A sequence's effect on SOLVED is its full permutation, so replacing it with
 * the same effect also preserves its action on any scrambled starting state.
 */
export function shortenSolution(moves:readonly Move[]):Move[] {
  const solved=solvedNeighborhood();let result=[...moves];
  for(;;){
    let best:{start:number;end:number;replacement:Move[];saving:number}|undefined;
    for(let start=0;start<result.length;start++){
      let effect=SOLVED;
      for(let end=start+1;end<=result.length;end++){
        effect=moveFacelets(effect,result[end-1]!);
        const undo=solved.get(effect);if(!undo)continue;
        const saving=end-start-undo.length;
        if(saving<=0||saving<=(best?.saving??0))continue;
        best={start,end,saving,replacement:[...undo].reverse().map(inverseMove)};
      }
    }
    if(!best)return result;
    const replacement=[...result.slice(0,best.start),...best.replacement,...result.slice(best.end)];
    // Keep this check independent of the shortcut table's construction.
    if(applyMoves(SOLVED,replacement)!==applyMoves(SOLVED,result))throw new Error('The shorter solution could not be verified.');
    result=replacement;
  }
}
