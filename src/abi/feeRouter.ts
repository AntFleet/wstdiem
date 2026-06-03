export const feeRouterHarvestEventAbis = [
  {
    type: "event",
    name: "WETHHarvested",
    inputs: [
      { name: "wethIn", type: "uint256", indexed: false },
      { name: "wstDIEMOut", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "WstDIEMHarvested",
    inputs: [{ name: "amount", type: "uint256", indexed: false }],
  },
  {
    type: "event",
    name: "VVVHarvested",
    inputs: [
      { name: "vvvIn", type: "uint256", indexed: false },
      { name: "diemCredited", type: "uint256", indexed: false },
    ],
  },
] as const;
