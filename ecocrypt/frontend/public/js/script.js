// public/js/script.js

// Connect wallet
async function connectWallet() {
  if (window.ethereum) {
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const walletAddress = accounts[0];
      document.getElementById("walletAddress").innerText = "Connected: " + walletAddress;

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      console.log("Wallet connected:", signer);

      return signer;
    } catch (err) {
      console.error("MetaMask connection failed:", err);
    }
  } else {
    alert("Please install MetaMask!");
  }
}

if (document.getElementById("connectButton")) {
  document.getElementById("connectButton").addEventListener("click", connectWallet);
}

// Smart contract info
const contractAddress = "0xYourContractAddress"; // replace with actual
const contractABI = [ /* paste your ABI here */ ];

// Get contract instance
async function getContract() {
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  return new ethers.Contract(contractAddress, contractABI, signer);
}

// Store audio hash on blockchain
async function storeAudioHash(hash) {
  try {
    const contract = await getContract();
    const tx = await contract.storeHash(hash);
    await tx.wait();
    alert("Hash stored on blockchain: " + hash);
  } catch (err) {
    console.error("Error storing hash:", err);
    alert("Failed to store hash!");
  }
}

// Handle account change
if (window.ethereum) {
  window.ethereum.on("accountsChanged", (accounts) => {
    document.getElementById("walletAddress").innerText = "Connected: " + accounts[0];
  });
}
