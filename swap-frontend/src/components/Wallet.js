import React, { useState, useEffect } from 'react';

const Wallet = ({ setWallet }) => {
  const [connected, setConnected] = useState(false);

  const connectWallet = async () => {
    if (window.solana) {
      await window.solana.connect();
      setWallet(window.solana);
      setConnected(true);
    }
  };

  useEffect(() => {
    if (window.solana && window.solana.isPhantom) {
      window.solana.connect({ onlyIfTrusted: true }).then(() => {
        setWallet(window.solana);
        setConnected(true);
      });
    }
  }, []);

  return (
    <div>
      {connected ? "Wallet Connected" : <button onClick={connectWallet}>Connect Wallet</button>}
    </div>
  );
};

export default Wallet;
