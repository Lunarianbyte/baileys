import makeWASocket from './Socket/index.js';
import chalk from "chalk"
console.log(chalk.blueBright(`Hi, Thank you for using baileys @Lunarianbyte/baileys,\n contact the maintenance if an error occurs\n`));
export * from '../WAProto/index.js';
export * from './Utils/index.js';
export * from './Types/index.js';
export * from './Store/index.js'; 
export * from './Defaults/index.js';
export * from './WABinary/index.js';
export * from './WAM/index.js';
export * from './WAUSync/index.js';
export { makeWASocket };
export default makeWASocket;
//# sourceMappingURL=index.js.map
