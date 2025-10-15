import { repomixConfigDefaultSchema } from 'repomix/lib/config/configSchema.js';

const defaultConfig = repomixConfigDefaultSchema.parse({});
console.log(JSON.stringify(defaultConfig, null, 2));
