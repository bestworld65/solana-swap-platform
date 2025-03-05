import React from 'react';

const Faucet = ({ faucetToken }) => (
  <div>
    <button onClick={() => faucetToken('A')}>Faucet Token A</button>
    <button onClick={() => faucetToken('B')}>Faucet Token B</button>
  </div>
);

export default Faucet;
