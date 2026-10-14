import { initializeSolver,solveFacelets } from './solve';
import {reconstructScan} from '../core/assembleScan';
initializeSolver();
(globalThis as unknown as {__solveCube:typeof solveFacelets}).__solveCube=solveFacelets;
(globalThis as unknown as {__assembleCube:typeof reconstructScan}).__assembleCube=reconstructScan;
