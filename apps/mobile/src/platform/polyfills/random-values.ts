// Hermes defines no crypto.getRandomValues. web3.js draws the id of every JSON-RPC request from it
// (through uuid), so a Connection cannot send a single request without it.
import 'react-native-get-random-values';
