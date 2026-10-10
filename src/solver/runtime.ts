import { initializeSolver,solveFacelets } from './solve';
initializeSolver();
(globalThis as unknown as {__solveCube:typeof solveFacelets}).__solveCube=solveFacelets;
