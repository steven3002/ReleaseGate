// Must stay the first import. The Solana libraries expect these globals, some of them as soon as
// their modules are evaluated.
import './src/platform/polyfills';

import { registerRootComponent } from 'expo';

import App from './src/App';

registerRootComponent(App);
