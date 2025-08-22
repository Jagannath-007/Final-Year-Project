// public/js/ipfs.js
import { create } from "ipfs-http-client";

// Infura IPFS endpoint
const ipfs = create({
  host: "ipfs.infura.io",
  port: 5001,
  protocol: "https",
});

export default ipfs;
