import React, { useState } from 'react';

const Swap = ({ swapTokens }) => {
  const [amount, setAmount] = useState(0);

  return (
    <div>
      <input
        type="number"
        placeholder="Amount"
        value={amount}
        onChange={(e) => setAmount(Number(e.target.value))}
      />
      <button onClick={() => swapTokens('A', amount)}>Swap A → B</button>
      <button onClick={() => swapTokens('B', amount)}>Swap B → A</button>
    </div>
  );
};

export default Swap;
