/** Suppress frame-by-frame chatter without delaying underlying camera state. */
export class ReadableMessage {
  private shown='';
  private shownAt=-Infinity;
  private candidate='';
  private candidateAt=0;
  reset(value:string,now:number){this.shown=value;this.shownAt=now;this.candidate=value;this.candidateAt=now;return value;}
  update(value:string,now:number):{text:string;wait:number} {
    if(!this.shown)return {text:this.reset(value,now),wait:0};
    if(value!==this.candidate){this.candidate=value;this.candidateAt=now;}
    if(value===this.shown)return {text:this.shown,wait:0};
    const wait=Math.max(0,650-(now-this.candidateAt),2000-(now-this.shownAt));
    if(!wait){this.shown=value;this.shownAt=now;}
    return {text:this.shown,wait};
  }
}
