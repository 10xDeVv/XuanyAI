import {expect,it} from 'vitest';
import {applyMoves,inverseMove,SOLVED} from '../src/core/cube';
import {stateAtStep} from '../src/core/cubePreview';
import {CubeState,Move,SolverAdapter} from '../src/core/types';
import {Session} from '../src/session/Session';
import {observation,state} from './fixtures';

const moves:Move[]=['R','U',"F'",'L','D','B'];
const initial=state(applyMoves(SOLVED,[...moves].reverse().map(inverseMove)));
const adapter=(seen:CubeState[]=[]):SolverAdapter=>({ready:async()=>{},dispose(){},solve:async s=>{seen.push(s);return {revision:s.revision,moves:[...moves]};}});
it('keeps the manual plan through missing camera frames and backgrounding without confirming moves',async()=>{
  const session=new Session(adapter());session.startFromPhoto(initial);await Promise.resolve();
  const plan=session.getSnapshot().solution!;expect(plan.moves).toEqual(moves);
  session.setPreviewOnly(true);
  for(let i=0;i<10;i++)session.observe(observation(state(SOLVED),['F','R','U'],i*150));
  session.suspend();
  expect(session.getSnapshot()).toMatchObject({stage:'guiding',movesDone:0,movesRemaining:6,cube:initial,solution:plan});
  session.rescan();
  for(let i=0;i<3;i++)session.observe(observation(initial,['F'],2000+i*150));
  expect(session.getSnapshot().captured).toEqual([initial.centers.F]);
  expect(session.getSnapshot().solution).toBeUndefined();session.dispose();
});
it('resumes the camera from the selected manual state and still requires fresh solved verification',async()=>{
  const seen:CubeState[]=[],session=new Session(adapter(seen));session.startFromPhoto(initial);await Promise.resolve();
  session.setPreviewOnly(true);
  const selected=stateAtStep(initial,moves,3);session.startFromPhoto(selected);await Promise.resolve();
  expect(seen[1]).toEqual(selected);expect(session.getSnapshot().solution!.state).toEqual(selected);
  expect(session.getSnapshot().movesDone).toBe(0);
  const solved=stateAtStep(initial,moves,moves.length);
  const check=new Session({ready:async()=>{},dispose(){},solve:async s=>({revision:s.revision,moves:[]})});
  check.startFromPhoto(solved);await Promise.resolve();
  expect(check.getSnapshot().stage).toBe('verifying');expect(check.getSnapshot().confirmedAt).toBe(0);
  session.dispose();check.dispose();
});
it('does not mutate an exposed solution when camera guidance advances a turn',async()=>{
  const session=new Session(adapter());session.startFromPhoto(initial);await Promise.resolve();
  const first=session.getSnapshot().solution!,after=stateAtStep(initial,moves,1);
  for(let i=0;i<3;i++)session.observe(observation(after,['F','R','U'],i*150));
  expect(session.getSnapshot().movesDone).toBe(1);
  expect(first.moves).toEqual(moves);
  expect(session.getSnapshot().solution!.moves).toEqual(moves.slice(1));
  expect(session.getSnapshot().solution!.state.facelets).toBe(after.facelets);session.dispose();
});
