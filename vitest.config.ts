import {defineConfig} from 'vitest/config';
export default defineConfig({resolve:{preserveSymlinks:true},test:{include:['tests/**/*.test.ts'],pool:'forks',maxWorkers:2,testTimeout:30000}});
