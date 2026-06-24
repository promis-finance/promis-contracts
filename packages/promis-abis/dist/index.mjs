// abi/OracleRedStoneAdaptor.json
var OracleRedStoneAdaptor_default = [
  {
    inputs: [],
    stateMutability: "nonpayable",
    type: "constructor"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "target",
        type: "address"
      }
    ],
    name: "AddressEmptyCode",
    type: "error"
  },
  {
    inputs: [],
    name: "AssetOracleMappingNotFound",
    type: "error"
  },
  {
    inputs: [],
    name: "CalldataMustHaveValidPayload",
    type: "error"
  },
  {
    inputs: [],
    name: "CalldataOverOrUnderFlow",
    type: "error"
  },
  {
    inputs: [],
    name: "CanNotPickMedianOfEmptyArray",
    type: "error"
  },
  {
    inputs: [],
    name: "DataPackageTimestampMustNotBeZero",
    type: "error"
  },
  {
    inputs: [],
    name: "DataPackageTimestampsMustBeEqual",
    type: "error"
  },
  {
    inputs: [],
    name: "DataTimestampCannotBeZero",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "implementation",
        type: "address"
      }
    ],
    name: "ERC1967InvalidImplementation",
    type: "error"
  },
  {
    inputs: [],
    name: "ERC1967NonPayable",
    type: "error"
  },
  {
    inputs: [],
    name: "EachSignerMustProvideTheSameValue",
    type: "error"
  },
  {
    inputs: [],
    name: "EmptyCalldataPointersArr",
    type: "error"
  },
  {
    inputs: [],
    name: "FailedCall",
    type: "error"
  },
  {
    inputs: [],
    name: "FutureOracleTimestamp",
    type: "error"
  },
  {
    inputs: [],
    name: "GetDataServiceIdNotImplemented",
    type: "error"
  },
  {
    inputs: [],
    name: "IncorrectUnsignedMetadataSize",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "receivedSignersCount",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "requiredSignersCount",
        type: "uint256"
      }
    ],
    name: "InsufficientNumberOfUniqueSigners",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidAddr",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidCalldataPointer",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidInitialization",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidInputs",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidOraclePrice",
    type: "error"
  },
  {
    inputs: [],
    name: "NotInitializing",
    type: "error"
  },
  {
    inputs: [],
    name: "OracleIdTooLong",
    type: "error"
  },
  {
    inputs: [],
    name: "RedstonePayloadMustHaveAtLeastOneDataPackage",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "receivedSigner",
        type: "address"
      }
    ],
    name: "SignerNotAuthorised",
    type: "error"
  },
  {
    inputs: [],
    name: "StaleOracleData",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "receivedTimestampSeconds",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "blockTimestamp",
        type: "uint256"
      }
    ],
    name: "TimestampFromTooLongFuture",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "receivedTimestampSeconds",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "blockTimestamp",
        type: "uint256"
      }
    ],
    name: "TimestampIsTooOld",
    type: "error"
  },
  {
    inputs: [],
    name: "TimestampsMustBeEqual",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "valueByteSize",
        type: "uint256"
      }
    ],
    name: "TooLargeValueByteSize",
    type: "error"
  },
  {
    inputs: [],
    name: "UUPSUnauthorizedCallContext",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "slot",
        type: "bytes32"
      }
    ],
    name: "UUPSUnsupportedProxiableUUID",
    type: "error"
  },
  {
    inputs: [],
    name: "Unauthorized",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "currentVersion",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "newVersion",
        type: "uint256"
      }
    ],
    name: "VersionNotIncremented",
    type: "error"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "asset",
        type: "address"
      },
      {
        indexed: false,
        internalType: "string",
        name: "oracleId",
        type: "string"
      },
      {
        indexed: false,
        internalType: "uint8",
        name: "oraclePriceDecimals",
        type: "uint8"
      }
    ],
    name: "AssetToOracleIdMappingUpdated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint64",
        name: "version",
        type: "uint64"
      }
    ],
    name: "Initialized",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "newThreshold",
        type: "uint256"
      }
    ],
    name: "StalenessThresholdUpdated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "implementation",
        type: "address"
      }
    ],
    name: "Upgraded",
    type: "event"
  },
  {
    inputs: [],
    name: "UPGRADE_INTERFACE_VERSION",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "VERSION",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256[]",
        name: "values",
        type: "uint256[]"
      }
    ],
    name: "aggregateValues",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "extractTimestampsAndAssertAllAreEqual",
    outputs: [
      {
        internalType: "uint256",
        name: "extractedTimestamp",
        type: "uint256"
      }
    ],
    stateMutability: "pure",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "signerAddress",
        type: "address"
      }
    ],
    name: "getAuthorisedSignerIndex",
    outputs: [
      {
        internalType: "uint8",
        name: "",
        type: "uint8"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getDataServiceId",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "asset",
        type: "address"
      }
    ],
    name: "getOracleIdForAsset",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "asset",
        type: "address"
      },
      {
        internalType: "bytes",
        name: "",
        type: "bytes"
      }
    ],
    name: "getOraclePriceForAsset",
    outputs: [
      {
        internalType: "uint256",
        name: "price",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getUniqueSignersThreshold",
    outputs: [
      {
        internalType: "uint8",
        name: "",
        type: "uint8"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_proTokenSettings",
        type: "address"
      }
    ],
    name: "initialize",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "proTokenSettings",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "proxiableUUID",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address[]",
        name: "assets",
        type: "address[]"
      },
      {
        internalType: "string[]",
        name: "oracleIds",
        type: "string[]"
      },
      {
        internalType: "uint8[]",
        name: "oraclePriceDecimals",
        type: "uint8[]"
      }
    ],
    name: "setAssetToOracleIdMappings",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_stalenessThreshold",
        type: "uint256"
      }
    ],
    name: "setStalenessThreshold",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newImplementation",
        type: "address"
      },
      {
        internalType: "bytes",
        name: "data",
        type: "bytes"
      }
    ],
    name: "upgradeToAndCall",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "receivedTimestampMilliseconds",
        type: "uint256"
      }
    ],
    name: "validateTimestamp",
    outputs: [],
    stateMutability: "view",
    type: "function"
  }
];

// abi/OracleAlgebraAdaptor.json
var OracleAlgebraAdaptor_default = [
  {
    inputs: [],
    stateMutability: "nonpayable",
    type: "constructor"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "target",
        type: "address"
      }
    ],
    name: "AddressEmptyCode",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "implementation",
        type: "address"
      }
    ],
    name: "ERC1967InvalidImplementation",
    type: "error"
  },
  {
    inputs: [],
    name: "ERC1967NonPayable",
    type: "error"
  },
  {
    inputs: [],
    name: "FailedCall",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidAddr",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidInitialization",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidInputs",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidOraclePrice",
    type: "error"
  },
  {
    inputs: [],
    name: "NotInitializing",
    type: "error"
  },
  {
    inputs: [],
    name: "RouteNotConfigured",
    type: "error"
  },
  {
    inputs: [],
    name: "StaleOracleData",
    type: "error"
  },
  {
    inputs: [],
    name: "UUPSUnauthorizedCallContext",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "slot",
        type: "bytes32"
      }
    ],
    name: "UUPSUnsupportedProxiableUUID",
    type: "error"
  },
  {
    inputs: [],
    name: "Unauthorized",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "currentVersion",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "newVersion",
        type: "uint256"
      }
    ],
    name: "VersionNotIncremented",
    type: "error"
  },
  {
    inputs: [],
    name: "tickOutOfRange",
    type: "error"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "newAdmin",
        type: "address"
      }
    ],
    name: "AdminUpdated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint64",
        name: "version",
        type: "uint64"
      }
    ],
    name: "Initialized",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "asset",
        type: "address"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "hopCount",
        type: "uint256"
      }
    ],
    name: "RouteConfigured",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint32",
        name: "twapPeriod",
        type: "uint32"
      },
      {
        indexed: false,
        internalType: "uint32",
        name: "twapPeriodMiddle",
        type: "uint32"
      },
      {
        indexed: false,
        internalType: "uint32",
        name: "twapPeriodLongest",
        type: "uint32"
      }
    ],
    name: "TwapPeriodsUpdated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "implementation",
        type: "address"
      }
    ],
    name: "Upgraded",
    type: "event"
  },
  {
    inputs: [],
    name: "UPGRADE_INTERFACE_VERSION",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "VERSION",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "asset",
        type: "address"
      },
      {
        components: [
          {
            internalType: "address[]",
            name: "pools",
            type: "address[]"
          },
          {
            internalType: "address[]",
            name: "plugins",
            type: "address[]"
          },
          {
            internalType: "address[]",
            name: "tokens0",
            type: "address[]"
          },
          {
            internalType: "address[]",
            name: "tokens1",
            type: "address[]"
          },
          {
            internalType: "uint8[]",
            name: "decimals0",
            type: "uint8[]"
          },
          {
            internalType: "uint8[]",
            name: "decimals1",
            type: "uint8[]"
          },
          {
            internalType: "bool[]",
            name: "directions",
            type: "bool[]"
          }
        ],
        internalType: "struct OracleAlgebraAdaptorTypes.RouteParams",
        name: "params",
        type: "tuple"
      }
    ],
    name: "configureRoute",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "asset",
        type: "address"
      },
      {
        internalType: "bytes",
        name: "",
        type: "bytes"
      }
    ],
    name: "getOraclePriceForAsset",
    outputs: [
      {
        internalType: "uint256",
        name: "price",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "asset",
        type: "address"
      }
    ],
    name: "getRouteForAsset",
    outputs: [
      {
        components: [
          {
            internalType: "address",
            name: "pool",
            type: "address"
          },
          {
            internalType: "address",
            name: "plugin",
            type: "address"
          },
          {
            internalType: "address",
            name: "token0",
            type: "address"
          },
          {
            internalType: "address",
            name: "token1",
            type: "address"
          },
          {
            internalType: "bool",
            name: "zeroToOne",
            type: "bool"
          }
        ],
        internalType: "struct OracleAlgebraAdaptorTypes.PoolConfig[]",
        name: "",
        type: "tuple[]"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_proTokenSettings",
        type: "address"
      }
    ],
    name: "initialize",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "proTokenSettings",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "proxiableUUID",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint32",
        name: "_twapPeriod",
        type: "uint32"
      },
      {
        internalType: "uint32",
        name: "_twapPeriodMiddle",
        type: "uint32"
      },
      {
        internalType: "uint32",
        name: "_twapPeriodLongest",
        type: "uint32"
      }
    ],
    name: "setTwapPeriods",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "twapPeriod",
    outputs: [
      {
        internalType: "uint32",
        name: "",
        type: "uint32"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "twapPeriodLongest",
    outputs: [
      {
        internalType: "uint32",
        name: "",
        type: "uint32"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "twapPeriodMiddle",
    outputs: [
      {
        internalType: "uint32",
        name: "",
        type: "uint32"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newImplementation",
        type: "address"
      },
      {
        internalType: "bytes",
        name: "data",
        type: "bytes"
      }
    ],
    name: "upgradeToAndCall",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  }
];

// abi/OracleChainlinkPushAdaptor.json
var OracleChainlinkPushAdaptor_default = [
  {
    inputs: [],
    stateMutability: "nonpayable",
    type: "constructor"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "target",
        type: "address"
      }
    ],
    name: "AddressEmptyCode",
    type: "error"
  },
  {
    inputs: [],
    name: "AssetOracleMappingNotFound",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "implementation",
        type: "address"
      }
    ],
    name: "ERC1967InvalidImplementation",
    type: "error"
  },
  {
    inputs: [],
    name: "ERC1967NonPayable",
    type: "error"
  },
  {
    inputs: [],
    name: "FailedCall",
    type: "error"
  },
  {
    inputs: [],
    name: "FutureOracleTimestamp",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidAddr",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidInitialization",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidInputs",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidOraclePrice",
    type: "error"
  },
  {
    inputs: [],
    name: "NotInitializing",
    type: "error"
  },
  {
    inputs: [],
    name: "StaleOracleData",
    type: "error"
  },
  {
    inputs: [],
    name: "UUPSUnauthorizedCallContext",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "slot",
        type: "bytes32"
      }
    ],
    name: "UUPSUnsupportedProxiableUUID",
    type: "error"
  },
  {
    inputs: [],
    name: "Unauthorized",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "currentVersion",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "newVersion",
        type: "uint256"
      }
    ],
    name: "VersionNotIncremented",
    type: "error"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "asset",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "pushOracle",
        type: "address"
      },
      {
        indexed: false,
        internalType: "uint8",
        name: "priceDecimals",
        type: "uint8"
      }
    ],
    name: "AssetToPushOracleMappingUpdated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint64",
        name: "version",
        type: "uint64"
      }
    ],
    name: "Initialized",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "threshold",
        type: "uint256"
      }
    ],
    name: "StalenessThresholdUpdated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "implementation",
        type: "address"
      }
    ],
    name: "Upgraded",
    type: "event"
  },
  {
    inputs: [],
    name: "UPGRADE_INTERFACE_VERSION",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "VERSION",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "",
        type: "address"
      }
    ],
    name: "assetToPriceDecimals",
    outputs: [
      {
        internalType: "uint8",
        name: "",
        type: "uint8"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "",
        type: "address"
      }
    ],
    name: "assetToPushOracleContract",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "asset",
        type: "address"
      },
      {
        internalType: "bytes",
        name: "",
        type: "bytes"
      }
    ],
    name: "getOraclePriceForAsset",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "asset",
        type: "address"
      }
    ],
    name: "getPushOracleForAsset",
    outputs: [
      {
        internalType: "address",
        name: "pushOracle",
        type: "address"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_proTokenSettings",
        type: "address"
      }
    ],
    name: "initialize",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "proTokenSettings",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "proxiableUUID",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address[]",
        name: "assets",
        type: "address[]"
      },
      {
        internalType: "address[]",
        name: "pushOracleContracts",
        type: "address[]"
      },
      {
        internalType: "uint8[]",
        name: "priceDecimals",
        type: "uint8[]"
      }
    ],
    name: "setAssetToPushOracleMappings",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "threshold",
        type: "uint256"
      }
    ],
    name: "setStalenessThreshold",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "stalenessThreshold",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newImplementation",
        type: "address"
      },
      {
        internalType: "bytes",
        name: "data",
        type: "bytes"
      }
    ],
    name: "upgradeToAndCall",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  }
];

// abi/ProToken.json
var ProToken_default = [
  {
    inputs: [],
    stateMutability: "nonpayable",
    type: "constructor"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "target",
        type: "address"
      }
    ],
    name: "AddressEmptyCode",
    type: "error"
  },
  {
    inputs: [],
    name: "ECDSAInvalidSignature",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "length",
        type: "uint256"
      }
    ],
    name: "ECDSAInvalidSignatureLength",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "s",
        type: "bytes32"
      }
    ],
    name: "ECDSAInvalidSignatureS",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "implementation",
        type: "address"
      }
    ],
    name: "ERC1967InvalidImplementation",
    type: "error"
  },
  {
    inputs: [],
    name: "ERC1967NonPayable",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "spender",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "allowance",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "needed",
        type: "uint256"
      }
    ],
    name: "ERC20InsufficientAllowance",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "sender",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "balance",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "needed",
        type: "uint256"
      }
    ],
    name: "ERC20InsufficientBalance",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "approver",
        type: "address"
      }
    ],
    name: "ERC20InvalidApprover",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "receiver",
        type: "address"
      }
    ],
    name: "ERC20InvalidReceiver",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "sender",
        type: "address"
      }
    ],
    name: "ERC20InvalidSender",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "spender",
        type: "address"
      }
    ],
    name: "ERC20InvalidSpender",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "deadline",
        type: "uint256"
      }
    ],
    name: "ERC2612ExpiredSignature",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "signer",
        type: "address"
      },
      {
        internalType: "address",
        name: "owner",
        type: "address"
      }
    ],
    name: "ERC2612InvalidSigner",
    type: "error"
  },
  {
    inputs: [],
    name: "FailedCall",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "account",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "currentNonce",
        type: "uint256"
      }
    ],
    name: "InvalidAccountNonce",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidAddr",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidAmount",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidInitialization",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidMinter",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidOperator",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidPrice",
    type: "error"
  },
  {
    inputs: [],
    name: "NotInitializing",
    type: "error"
  },
  {
    inputs: [],
    name: "PriceNotConfigured",
    type: "error"
  },
  {
    inputs: [],
    name: "UUPSUnauthorizedCallContext",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "slot",
        type: "bytes32"
      }
    ],
    name: "UUPSUnsupportedProxiableUUID",
    type: "error"
  },
  {
    inputs: [],
    name: "Unauthorized",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "currentVersion",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "newVersion",
        type: "uint256"
      }
    ],
    name: "VersionNotIncremented",
    type: "error"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "owner",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "spender",
        type: "address"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "value",
        type: "uint256"
      }
    ],
    name: "Approval",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "from",
        type: "address"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      }
    ],
    name: "Burned",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [],
    name: "EIP712DomainChanged",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint64",
        name: "version",
        type: "uint64"
      }
    ],
    name: "Initialized",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "to",
        type: "address"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      }
    ],
    name: "Minted",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "newMinter",
        type: "address"
      }
    ],
    name: "MinterSet",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "from",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "to",
        type: "address"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "value",
        type: "uint256"
      }
    ],
    name: "Transfer",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "price",
        type: "uint256"
      }
    ],
    name: "USDPriceSet",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "implementation",
        type: "address"
      }
    ],
    name: "Upgraded",
    type: "event"
  },
  {
    inputs: [],
    name: "DEFAULT_USD_PRICE",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "DOMAIN_SEPARATOR",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "MIN_USD_PRICE",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "UPGRADE_INTERFACE_VERSION",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "VERSION",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address"
      },
      {
        internalType: "address",
        name: "spender",
        type: "address"
      }
    ],
    name: "allowance",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "spender",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "value",
        type: "uint256"
      }
    ],
    name: "approve",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool"
      }
    ],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "account",
        type: "address"
      }
    ],
    name: "balanceOf",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "from",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      }
    ],
    name: "burn",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [
      {
        internalType: "uint8",
        name: "",
        type: "uint8"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "eip712Domain",
    outputs: [
      {
        internalType: "bytes1",
        name: "fields",
        type: "bytes1"
      },
      {
        internalType: "string",
        name: "name",
        type: "string"
      },
      {
        internalType: "string",
        name: "version",
        type: "string"
      },
      {
        internalType: "uint256",
        name: "chainId",
        type: "uint256"
      },
      {
        internalType: "address",
        name: "verifyingContract",
        type: "address"
      },
      {
        internalType: "bytes32",
        name: "salt",
        type: "bytes32"
      },
      {
        internalType: "uint256[]",
        name: "extensions",
        type: "uint256[]"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getMinter",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getProTokenSettings",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getUSDPrice",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "string",
        name: "name",
        type: "string"
      },
      {
        internalType: "string",
        name: "symbol",
        type: "string"
      },
      {
        internalType: "address",
        name: "_proTokenSettings",
        type: "address"
      },
      {
        internalType: "address",
        name: "_minter",
        type: "address"
      }
    ],
    name: "initialize",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "to",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      }
    ],
    name: "mint",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "name",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address"
      }
    ],
    name: "nonces",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address"
      },
      {
        internalType: "address",
        name: "spender",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "value",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "deadline",
        type: "uint256"
      },
      {
        internalType: "uint8",
        name: "v",
        type: "uint8"
      },
      {
        internalType: "bytes32",
        name: "r",
        type: "bytes32"
      },
      {
        internalType: "bytes32",
        name: "s",
        type: "bytes32"
      }
    ],
    name: "permit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "proxiableUUID",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newMinter",
        type: "address"
      }
    ],
    name: "setMinter",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_price",
        type: "uint256"
      }
    ],
    name: "setUSDPrice",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "to",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "value",
        type: "uint256"
      }
    ],
    name: "transfer",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool"
      }
    ],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "from",
        type: "address"
      },
      {
        internalType: "address",
        name: "to",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "value",
        type: "uint256"
      }
    ],
    name: "transferFrom",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool"
      }
    ],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newImplementation",
        type: "address"
      },
      {
        internalType: "bytes",
        name: "data",
        type: "bytes"
      }
    ],
    name: "upgradeToAndCall",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  }
];

// abi/ProTokenOperations.json
var ProTokenOperations_default = [
  {
    inputs: [],
    stateMutability: "nonpayable",
    type: "constructor"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "target",
        type: "address"
      }
    ],
    name: "AddressEmptyCode",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "implementation",
        type: "address"
      }
    ],
    name: "ERC1967InvalidImplementation",
    type: "error"
  },
  {
    inputs: [],
    name: "ERC1967NonPayable",
    type: "error"
  },
  {
    inputs: [],
    name: "FailedCall",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "amountOut",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "minAmountOut",
        type: "uint256"
      }
    ],
    name: "InsufficientAmountOut",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "minimumRequired",
        type: "uint256"
      }
    ],
    name: "InsufficientUnmintAmount",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidAddr",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidAmount",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidInitialization",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidInput",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidNumber",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidOracleConfiguration",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "oracle",
        type: "address"
      }
    ],
    name: "InvalidOraclePrice",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "yAsset",
        type: "address"
      }
    ],
    name: "InvalidUnmintAsset",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_oracle",
        type: "address"
      }
    ],
    name: "MissingOraclePayload",
    type: "error"
  },
  {
    inputs: [],
    name: "NoValidOracleResponses",
    type: "error"
  },
  {
    inputs: [],
    name: "NotImplemented",
    type: "error"
  },
  {
    inputs: [],
    name: "NotInitializing",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "deviation",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "maxAllowed",
        type: "uint256"
      }
    ],
    name: "OraclePriceDeviation",
    type: "error"
  },
  {
    inputs: [],
    name: "Paused",
    type: "error"
  },
  {
    inputs: [],
    name: "ReentrancyGuardReentrantCall",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "token",
        type: "address"
      }
    ],
    name: "SafeERC20FailedOperation",
    type: "error"
  },
  {
    inputs: [],
    name: "UUPSUnauthorizedCallContext",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "slot",
        type: "bytes32"
      }
    ],
    name: "UUPSUnsupportedProxiableUUID",
    type: "error"
  },
  {
    inputs: [],
    name: "Unauthorized",
    type: "error"
  },
  {
    inputs: [],
    name: "UnmintOnlyToUnderlying",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "currentVersion",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "newVersion",
        type: "uint256"
      }
    ],
    name: "VersionNotIncremented",
    type: "error"
  },
  {
    inputs: [],
    name: "YAssetNotEnabled",
    type: "error"
  },
  {
    inputs: [],
    name: "YAssetPaused",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "assetPrice",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "upperLimit",
        type: "uint256"
      }
    ],
    name: "YAssetPriceExceedsThreshold",
    type: "error"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint64",
        name: "version",
        type: "uint64"
      }
    ],
    name: "Initialized",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "yAsset",
        type: "address"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "lstRatio",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "adjustedUSD",
        type: "uint256"
      }
    ],
    name: "LSTRatioApplied",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "yAsset",
        type: "address"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "threshold",
        type: "uint256"
      }
    ],
    name: "PriceDeviationThresholdSet",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "sender",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "receiver",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "yAsset",
        type: "address"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "yAssetAmount",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "proTokenAmount",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "bool",
        name: "isUnderlyingAsset",
        type: "bool"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "yAssetUSD",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "proTokenUSD",
        type: "uint256"
      }
    ],
    name: "ProTokenMint",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "sender",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "receiver",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "yAsset",
        type: "address"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "proTokenAmount",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "unmintYAssetAmount",
        type: "uint256"
      }
    ],
    name: "ProTokenUnmint",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "implementation",
        type: "address"
      }
    ],
    name: "Upgraded",
    type: "event"
  },
  {
    inputs: [],
    name: "MAX_BATCH_SIZE",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "UPGRADE_INTERFACE_VERSION",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "VERSION",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "yAsset",
        type: "address"
      }
    ],
    name: "getYAssetPriceDeviationThreshold",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_proTokenSettings",
        type: "address"
      }
    ],
    name: "initialize",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_yAsset",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "_amount",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "_minAmountOut",
        type: "uint256"
      },
      {
        internalType: "address",
        name: "_receiver",
        type: "address"
      },
      {
        components: [
          {
            internalType: "address",
            name: "oracleAddress",
            type: "address"
          },
          {
            internalType: "bytes",
            name: "payload",
            type: "bytes"
          }
        ],
        internalType: "struct ProTokenOperationsTypes.OracleQuery[]",
        name: "_oracleQueries",
        type: "tuple[]"
      }
    ],
    name: "mintProToken",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address[]",
        name: "_yAssets",
        type: "address[]"
      },
      {
        internalType: "uint256[]",
        name: "_amounts",
        type: "uint256[]"
      },
      {
        internalType: "uint256[]",
        name: "_minAmountOuts",
        type: "uint256[]"
      },
      {
        internalType: "address",
        name: "_receiver",
        type: "address"
      },
      {
        components: [
          {
            internalType: "address",
            name: "oracleAddress",
            type: "address"
          },
          {
            internalType: "bytes",
            name: "payload",
            type: "bytes"
          }
        ],
        internalType: "struct ProTokenOperationsTypes.OracleQuery[]",
        name: "_oracleQueries",
        type: "tuple[]"
      }
    ],
    name: "multiMintProToken",
    outputs: [
      {
        internalType: "uint256[]",
        name: "mintedAmounts",
        type: "uint256[]"
      }
    ],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "proxiableUUID",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "yAsset",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "priceDeviationThresholdPer",
        type: "uint256"
      }
    ],
    name: "setYAssetPriceDeviationThreshold",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_yAsset",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "_amount",
        type: "uint256"
      },
      {
        components: [
          {
            internalType: "address",
            name: "oracleAddress",
            type: "address"
          },
          {
            internalType: "bytes",
            name: "payload",
            type: "bytes"
          }
        ],
        internalType: "struct ProTokenOperationsTypes.OracleQuery[]",
        name: "_oracleQueries",
        type: "tuple[]"
      }
    ],
    name: "simulateMintProToken",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_yAsset",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "_amount",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "_minAmountOut",
        type: "uint256"
      },
      {
        internalType: "address",
        name: "_receiver",
        type: "address"
      },
      {
        components: [
          {
            internalType: "address",
            name: "oracleAddress",
            type: "address"
          },
          {
            internalType: "bytes",
            name: "payload",
            type: "bytes"
          }
        ],
        internalType: "struct ProTokenOperationsTypes.OracleQuery[]",
        name: "_oracleQueries",
        type: "tuple[]"
      }
    ],
    name: "unMintProToken",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newImplementation",
        type: "address"
      },
      {
        internalType: "bytes",
        name: "data",
        type: "bytes"
      }
    ],
    name: "upgradeToAndCall",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  }
];

// abi/ProTokenSettings.json
var ProTokenSettings_default = [
  {
    inputs: [],
    stateMutability: "nonpayable",
    type: "constructor"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "target",
        type: "address"
      }
    ],
    name: "AddressEmptyCode",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "implementation",
        type: "address"
      }
    ],
    name: "ERC1967InvalidImplementation",
    type: "error"
  },
  {
    inputs: [],
    name: "ERC1967NonPayable",
    type: "error"
  },
  {
    inputs: [],
    name: "EnforcedPause",
    type: "error"
  },
  {
    inputs: [],
    name: "ExpectedPause",
    type: "error"
  },
  {
    inputs: [],
    name: "FailedCall",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidAddr",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidAllocation",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidAmount",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidInitialization",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidInput",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidNumber",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidUnmintAllocation",
    type: "error"
  },
  {
    inputs: [],
    name: "NoYAssetsFound",
    type: "error"
  },
  {
    inputs: [],
    name: "NotInitializing",
    type: "error"
  },
  {
    inputs: [],
    name: "UUPSUnauthorizedCallContext",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "slot",
        type: "bytes32"
      }
    ],
    name: "UUPSUnsupportedProxiableUUID",
    type: "error"
  },
  {
    inputs: [],
    name: "Unauthorized",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "currentVersion",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "newVersion",
        type: "uint256"
      }
    ],
    name: "VersionNotIncremented",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "yAsset",
        type: "address"
      }
    ],
    name: "YAssetInUseForUnmint",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "yAsset",
        type: "address"
      }
    ],
    name: "YAssetNotFound",
    type: "error"
  },
  {
    inputs: [],
    name: "YOperationsHandlerInUseBalanceNotZero",
    type: "error"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "previousAdmin",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "newAdmin",
        type: "address"
      }
    ],
    name: "AdminAccepted",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "currentAdmin",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "proposedAdmin",
        type: "address"
      }
    ],
    name: "AdminProposed",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address",
        name: "previousExternalBusiness",
        type: "address"
      },
      {
        indexed: false,
        internalType: "address",
        name: "newExternalBusiness",
        type: "address"
      }
    ],
    name: "ExternalBusinessSet",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint64",
        name: "version",
        type: "uint64"
      }
    ],
    name: "Initialized",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "previousOperator",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "newOperator",
        type: "address"
      }
    ],
    name: "OperatorSet",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "maxPriceDeviation",
        type: "uint256"
      }
    ],
    name: "OracleAggregationSettingsSet",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address",
        name: "account",
        type: "address"
      }
    ],
    name: "Paused",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "previousOperations",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "newOperations",
        type: "address"
      }
    ],
    name: "ProTokenOperationsSet",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address",
        name: "oraclePriceSource",
        type: "address"
      }
    ],
    name: "ProTokenPriceSettingsSet",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "previousProToken",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "newProToken",
        type: "address"
      }
    ],
    name: "ProTokenSet",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address",
        name: "previousUnmintHandler",
        type: "address"
      },
      {
        indexed: false,
        internalType: "address",
        name: "newUnmintHandler",
        type: "address"
      }
    ],
    name: "ProTokenUnmintHandlerSet",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address[]",
        name: "oldAssets",
        type: "address[]"
      },
      {
        indexed: false,
        internalType: "address[]",
        name: "newAssets",
        type: "address[]"
      }
    ],
    name: "UnmintYAssetsUpdated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address",
        name: "account",
        type: "address"
      }
    ],
    name: "Unpaused",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "implementation",
        type: "address"
      }
    ],
    name: "Upgraded",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address",
        name: "yAsset",
        type: "address"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "yAssetLstRatio",
        type: "uint256"
      }
    ],
    name: "YAssetLstRatioSet",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "yAsset",
        type: "address"
      }
    ],
    name: "YAssetRemoved",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "yAsset",
        type: "address"
      }
    ],
    name: "YAssetSet",
    type: "event"
  },
  {
    inputs: [],
    name: "MAX_PRICE_DEVIATION_BPS",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "UPGRADE_INTERFACE_VERSION",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "VERSION",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "acceptAdmin",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "getAdmin",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getExternalBusiness",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getOperator",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getOracleAggregationSettings",
    outputs: [
      {
        components: [
          {
            internalType: "uint256",
            name: "maxPriceDeviation",
            type: "uint256"
          }
        ],
        internalType: "struct ProTokenOperationsTypes.OracleAggregationSettings",
        name: "",
        type: "tuple"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getProTokenInfo",
    outputs: [
      {
        components: [
          {
            internalType: "address",
            name: "proToken",
            type: "address"
          },
          {
            internalType: "address",
            name: "proTokenOperations",
            type: "address"
          },
          {
            internalType: "address",
            name: "proTokenUnmintHandler",
            type: "address"
          },
          {
            components: [
              {
                internalType: "address",
                name: "oraclePriceSource",
                type: "address"
              }
            ],
            internalType: "struct ProTokenSettingsTypes.ProTokenPriceSettings",
            name: "priceSettings",
            type: "tuple"
          }
        ],
        internalType: "struct ProTokenSettingsTypes.GetProTokenInfoResponse",
        name: "",
        type: "tuple"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getUnmintYAssets",
    outputs: [
      {
        internalType: "address[]",
        name: "",
        type: "address[]"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_yAsset",
        type: "address"
      }
    ],
    name: "getYAssetLstRatioSetLatestTimestamp",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address[]",
        name: "_yAssets",
        type: "address[]"
      }
    ],
    name: "getYAssets",
    outputs: [
      {
        components: [
          {
            components: [
              {
                internalType: "address",
                name: "yAsset",
                type: "address"
              },
              {
                components: [
                  {
                    internalType: "bool",
                    name: "isEnabled",
                    type: "bool"
                  },
                  {
                    internalType: "bool",
                    name: "isPaused",
                    type: "bool"
                  },
                  {
                    internalType: "uint8",
                    name: "decimals",
                    type: "uint8"
                  },
                  {
                    components: [
                      {
                        internalType: "uint256",
                        name: "staticPriceSource",
                        type: "uint256"
                      },
                      {
                        internalType: "address[]",
                        name: "oraclePriceSources",
                        type: "address[]"
                      },
                      {
                        internalType: "address",
                        name: "lstUnderlyingAsset",
                        type: "address"
                      },
                      {
                        internalType: "uint256",
                        name: "lstUnderlyingAssetRatio",
                        type: "uint256"
                      },
                      {
                        internalType: "uint256",
                        name: "lstUnderlyingAssetStaticPriceSource",
                        type: "uint256"
                      },
                      {
                        internalType: "address[]",
                        name: "lstUnderlyingAssetOraclePriceSources",
                        type: "address[]"
                      },
                      {
                        internalType: "uint256",
                        name: "usdCap",
                        type: "uint256"
                      }
                    ],
                    internalType: "struct ProTokenSettingsTypes.YAssetPriceSettings",
                    name: "priceSettings",
                    type: "tuple"
                  },
                  {
                    internalType: "uint256",
                    name: "unmintFeePer",
                    type: "uint256"
                  },
                  {
                    internalType: "address",
                    name: "yOperationsHandler",
                    type: "address"
                  }
                ],
                internalType: "struct ProTokenSettingsTypes.YAssetSettings",
                name: "settings",
                type: "tuple"
              }
            ],
            internalType: "struct ProTokenSettingsTypes.GetYAssetResponse[]",
            name: "yAssets",
            type: "tuple[]"
          }
        ],
        internalType: "struct ProTokenSettingsTypes.GetYAssetsResponse",
        name: "yAssetsResponse",
        type: "tuple"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_admin",
        type: "address"
      },
      {
        internalType: "address",
        name: "_operator",
        type: "address"
      }
    ],
    name: "initialize",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "isPaused",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "pause",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "paused",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_newAdmin",
        type: "address"
      }
    ],
    name: "proposeAdmin",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "proxiableUUID",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_yAsset",
        type: "address"
      }
    ],
    name: "removeYAsset",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_externalBusiness",
        type: "address"
      }
    ],
    name: "setExternalBusiness",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_operator",
        type: "address"
      }
    ],
    name: "setOperator",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_maxPriceDeviation",
        type: "uint256"
      }
    ],
    name: "setOracleAggregationSettings",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_proToken",
        type: "address"
      }
    ],
    name: "setProToken",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_proTokenOperations",
        type: "address"
      }
    ],
    name: "setProTokenOperations",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "oraclePriceSource",
            type: "address"
          }
        ],
        internalType: "struct ProTokenSettingsTypes.ProTokenPriceSettings",
        name: "_proTokenPriceSettings",
        type: "tuple"
      }
    ],
    name: "setProTokenPriceSettings",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_proTokenUnmintHandler",
        type: "address"
      }
    ],
    name: "setProTokenUnmintHandler",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address[]",
        name: "_unmintYAssets",
        type: "address[]"
      }
    ],
    name: "setUnmintYAssets",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_yAsset",
        type: "address"
      },
      {
        components: [
          {
            internalType: "bool",
            name: "isEnabled",
            type: "bool"
          },
          {
            internalType: "bool",
            name: "isPaused",
            type: "bool"
          },
          {
            internalType: "uint8",
            name: "decimals",
            type: "uint8"
          },
          {
            components: [
              {
                internalType: "uint256",
                name: "staticPriceSource",
                type: "uint256"
              },
              {
                internalType: "address[]",
                name: "oraclePriceSources",
                type: "address[]"
              },
              {
                internalType: "address",
                name: "lstUnderlyingAsset",
                type: "address"
              },
              {
                internalType: "uint256",
                name: "lstUnderlyingAssetRatio",
                type: "uint256"
              },
              {
                internalType: "uint256",
                name: "lstUnderlyingAssetStaticPriceSource",
                type: "uint256"
              },
              {
                internalType: "address[]",
                name: "lstUnderlyingAssetOraclePriceSources",
                type: "address[]"
              },
              {
                internalType: "uint256",
                name: "usdCap",
                type: "uint256"
              }
            ],
            internalType: "struct ProTokenSettingsTypes.YAssetPriceSettings",
            name: "priceSettings",
            type: "tuple"
          },
          {
            internalType: "uint256",
            name: "unmintFeePer",
            type: "uint256"
          },
          {
            internalType: "address",
            name: "yOperationsHandler",
            type: "address"
          }
        ],
        internalType: "struct ProTokenSettingsTypes.YAssetSettings",
        name: "_settings",
        type: "tuple"
      }
    ],
    name: "setYAsset",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address[]",
        name: "_yAsset",
        type: "address[]"
      },
      {
        internalType: "uint256[]",
        name: "_yAssetLstRatio",
        type: "uint256[]"
      }
    ],
    name: "setYAssetsLstRatio",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "unpause",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newImplementation",
        type: "address"
      },
      {
        internalType: "bytes",
        name: "data",
        type: "bytes"
      }
    ],
    name: "upgradeToAndCall",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "",
        type: "address"
      }
    ],
    name: "yAssetLstRatioSetLatestTimestamp",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  }
];

// abi/ProTokenUnmintHandler.json
var ProTokenUnmintHandler_default = [
  {
    inputs: [],
    stateMutability: "nonpayable",
    type: "constructor"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "target",
        type: "address"
      }
    ],
    name: "AddressEmptyCode",
    type: "error"
  },
  {
    inputs: [],
    name: "AlreadyClaimed",
    type: "error"
  },
  {
    inputs: [],
    name: "BatchAlreadyProcessed",
    type: "error"
  },
  {
    inputs: [],
    name: "BatchStillProcessing",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "implementation",
        type: "address"
      }
    ],
    name: "ERC1967InvalidImplementation",
    type: "error"
  },
  {
    inputs: [],
    name: "ERC1967NonPayable",
    type: "error"
  },
  {
    inputs: [],
    name: "FailedCall",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidAddr",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidAmount",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidDuration",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidInitialization",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidInput",
    type: "error"
  },
  {
    inputs: [],
    name: "NotInitializing",
    type: "error"
  },
  {
    inputs: [],
    name: "Paused",
    type: "error"
  },
  {
    inputs: [],
    name: "ReentrancyGuardReentrantCall",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "token",
        type: "address"
      }
    ],
    name: "SafeERC20FailedOperation",
    type: "error"
  },
  {
    inputs: [],
    name: "UUPSUnauthorizedCallContext",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "slot",
        type: "bytes32"
      }
    ],
    name: "UUPSUnsupportedProxiableUUID",
    type: "error"
  },
  {
    inputs: [],
    name: "Unauthorized",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "currentVersion",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "newVersion",
        type: "uint256"
      }
    ],
    name: "VersionNotIncremented",
    type: "error"
  },
  {
    inputs: [],
    name: "WithdrawFailed",
    type: "error"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "token",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "to",
        type: "address"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      }
    ],
    name: "EmergencyWithdraw",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint64",
        name: "version",
        type: "uint64"
      }
    ],
    name: "Initialized",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "previousDuration",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "newDuration",
        type: "uint256"
      }
    ],
    name: "UnmintBatchDurationUpdated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "yAsset",
        type: "address"
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "batchId",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "totalAmount",
        type: "uint256"
      },
      {
        indexed: true,
        internalType: "address",
        name: "processor",
        type: "address"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256"
      }
    ],
    name: "UnmintBatchProcessed",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "receiver",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "yAsset",
        type: "address"
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "requestId",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "batchId",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "additionalAmount",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "newTotalAmount",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256"
      }
    ],
    name: "UnmintRequestAggregated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "receiver",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "yAsset",
        type: "address"
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "requestId",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "batchId",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256"
      }
    ],
    name: "UnmintRequestClaimed",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "receiver",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "yAsset",
        type: "address"
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "requestId",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "batchId",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256"
      }
    ],
    name: "UnmintRequestCreated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "implementation",
        type: "address"
      }
    ],
    name: "Upgraded",
    type: "event"
  },
  {
    inputs: [],
    name: "MAX_BATCH_SIZE",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "UPGRADE_INTERFACE_VERSION",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "VERSION",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "yAsset",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "batchId",
        type: "uint256"
      }
    ],
    name: "canBatchBeProcessed",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "yAsset",
        type: "address"
      },
      {
        internalType: "uint256[]",
        name: "requestIds",
        type: "uint256[]"
      }
    ],
    name: "claimUnmintRequests",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "receiver",
        type: "address"
      },
      {
        internalType: "address",
        name: "yAsset",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      }
    ],
    name: "createUnmintRequest",
    outputs: [
      {
        internalType: "uint256",
        name: "requestId",
        type: "uint256"
      }
    ],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_token",
        type: "address"
      },
      {
        internalType: "address",
        name: "_to",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "_amount",
        type: "uint256"
      }
    ],
    name: "emergencyWithdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "yAsset",
        type: "address"
      }
    ],
    name: "getCurrentUnmintBatchId",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "yAsset",
        type: "address"
      }
    ],
    name: "getLastProcessedBatchId",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "yAsset",
        type: "address"
      }
    ],
    name: "getNextUnmintRequestId",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getProTokenSettings",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "receiver",
        type: "address"
      },
      {
        internalType: "address",
        name: "yAsset",
        type: "address"
      }
    ],
    name: "getUnclaimedBatchesForReceiver",
    outputs: [
      {
        internalType: "uint256[]",
        name: "",
        type: "uint256[]"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "receiver",
        type: "address"
      },
      {
        internalType: "address",
        name: "yAsset",
        type: "address"
      }
    ],
    name: "getUnclaimedRequestsForReceiver",
    outputs: [
      {
        components: [
          {
            internalType: "address",
            name: "yAsset",
            type: "address"
          },
          {
            internalType: "uint256",
            name: "requestId",
            type: "uint256"
          },
          {
            internalType: "uint256",
            name: "batchId",
            type: "uint256"
          },
          {
            internalType: "address",
            name: "receiver",
            type: "address"
          },
          {
            internalType: "uint256",
            name: "totalAmount",
            type: "uint256"
          },
          {
            internalType: "uint256[]",
            name: "amounts",
            type: "uint256[]"
          },
          {
            internalType: "uint256[]",
            name: "createTimestamps",
            type: "uint256[]"
          },
          {
            internalType: "bool",
            name: "claimed",
            type: "bool"
          },
          {
            internalType: "uint256",
            name: "claimTimestamp",
            type: "uint256"
          }
        ],
        internalType: "struct ProTokenUnmintHandlerTypes.UnmintRequest[]",
        name: "requests",
        type: "tuple[]"
      },
      {
        internalType: "uint256",
        name: "lastUnmintBatchIdProcessed",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "yAsset",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "batchId",
        type: "uint256"
      }
    ],
    name: "getUnmintBatch",
    outputs: [
      {
        components: [
          {
            internalType: "address",
            name: "yAsset",
            type: "address"
          },
          {
            internalType: "uint256",
            name: "batchId",
            type: "uint256"
          },
          {
            internalType: "uint256",
            name: "totalAmount",
            type: "uint256"
          },
          {
            internalType: "uint256",
            name: "createTimestamp",
            type: "uint256"
          },
          {
            internalType: "bool",
            name: "processed",
            type: "bool"
          },
          {
            internalType: "uint256",
            name: "processTimestamp",
            type: "uint256"
          },
          {
            internalType: "uint256",
            name: "totalAlreadyClaimed",
            type: "uint256"
          }
        ],
        internalType: "struct ProTokenUnmintHandlerTypes.UnmintBatch",
        name: "",
        type: "tuple"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getUnmintBatchDuration",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "yAsset",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "requestId",
        type: "uint256"
      }
    ],
    name: "getUnmintRequest",
    outputs: [
      {
        components: [
          {
            internalType: "address",
            name: "yAsset",
            type: "address"
          },
          {
            internalType: "uint256",
            name: "requestId",
            type: "uint256"
          },
          {
            internalType: "uint256",
            name: "batchId",
            type: "uint256"
          },
          {
            internalType: "address",
            name: "receiver",
            type: "address"
          },
          {
            internalType: "uint256",
            name: "totalAmount",
            type: "uint256"
          },
          {
            internalType: "uint256[]",
            name: "amounts",
            type: "uint256[]"
          },
          {
            internalType: "uint256[]",
            name: "createTimestamps",
            type: "uint256[]"
          },
          {
            internalType: "bool",
            name: "claimed",
            type: "bool"
          },
          {
            internalType: "uint256",
            name: "claimTimestamp",
            type: "uint256"
          }
        ],
        internalType: "struct ProTokenUnmintHandlerTypes.UnmintRequest",
        name: "",
        type: "tuple"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "yAsset",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "batchId",
        type: "uint256"
      },
      {
        internalType: "address",
        name: "receiver",
        type: "address"
      }
    ],
    name: "getUnmintRequestIdForReceiverInBatch",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_proTokenSettings",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "_unmintBatchDuration",
        type: "uint256"
      }
    ],
    name: "initialize",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "yAsset",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "batchId",
        type: "uint256"
      }
    ],
    name: "isUnmintBatchProcessed",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "yAsset",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "requestId",
        type: "uint256"
      }
    ],
    name: "isUnmintRequestClaimed",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "yAsset",
        type: "address"
      }
    ],
    name: "processNextUnmintBatch",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "proxiableUUID",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_duration",
        type: "uint256"
      }
    ],
    name: "setUnmintBatchDuration",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newImplementation",
        type: "address"
      },
      {
        internalType: "bytes",
        name: "data",
        type: "bytes"
      }
    ],
    name: "upgradeToAndCall",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  }
];

// abi/ERC20.json
var ERC20_default = [
  {
    inputs: [
      {
        internalType: "address",
        name: "spender",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "allowance",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "needed",
        type: "uint256"
      }
    ],
    name: "ERC20InsufficientAllowance",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "sender",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "balance",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "needed",
        type: "uint256"
      }
    ],
    name: "ERC20InsufficientBalance",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "approver",
        type: "address"
      }
    ],
    name: "ERC20InvalidApprover",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "receiver",
        type: "address"
      }
    ],
    name: "ERC20InvalidReceiver",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "sender",
        type: "address"
      }
    ],
    name: "ERC20InvalidSender",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "spender",
        type: "address"
      }
    ],
    name: "ERC20InvalidSpender",
    type: "error"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "owner",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "spender",
        type: "address"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "value",
        type: "uint256"
      }
    ],
    name: "Approval",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "from",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "to",
        type: "address"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "value",
        type: "uint256"
      }
    ],
    name: "Transfer",
    type: "event"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address"
      },
      {
        internalType: "address",
        name: "spender",
        type: "address"
      }
    ],
    name: "allowance",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "spender",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "value",
        type: "uint256"
      }
    ],
    name: "approve",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool"
      }
    ],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "account",
        type: "address"
      }
    ],
    name: "balanceOf",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [
      {
        internalType: "uint8",
        name: "",
        type: "uint8"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "name",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "to",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "value",
        type: "uint256"
      }
    ],
    name: "transfer",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool"
      }
    ],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "from",
        type: "address"
      },
      {
        internalType: "address",
        name: "to",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "value",
        type: "uint256"
      }
    ],
    name: "transferFrom",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool"
      }
    ],
    stateMutability: "nonpayable",
    type: "function"
  }
];

// abi/YAssetOperationsHandler.json
var YAssetOperationsHandler_default = [
  {
    inputs: [],
    stateMutability: "nonpayable",
    type: "constructor"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "target",
        type: "address"
      }
    ],
    name: "AddressEmptyCode",
    type: "error"
  },
  {
    inputs: [],
    name: "ArrayLengthMismatch",
    type: "error"
  },
  {
    inputs: [],
    name: "ContractPaused",
    type: "error"
  },
  {
    inputs: [],
    name: "CrosschainBridgeDepositCooldown",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "implementation",
        type: "address"
      }
    ],
    name: "ERC1967InvalidImplementation",
    type: "error"
  },
  {
    inputs: [],
    name: "ERC1967NonPayable",
    type: "error"
  },
  {
    inputs: [],
    name: "FailedCall",
    type: "error"
  },
  {
    inputs: [],
    name: "InsufficientBalance",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidAddr",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidAllocation",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidAmount",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidInitialization",
    type: "error"
  },
  {
    inputs: [],
    name: "NoProtocolHandlersConfigured",
    type: "error"
  },
  {
    inputs: [],
    name: "NotInitializing",
    type: "error"
  },
  {
    inputs: [],
    name: "Paused",
    type: "error"
  },
  {
    inputs: [],
    name: "ProtocolHandlerNotFound",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "token",
        type: "address"
      }
    ],
    name: "SafeERC20FailedOperation",
    type: "error"
  },
  {
    inputs: [],
    name: "UUPSUnauthorizedCallContext",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "slot",
        type: "bytes32"
      }
    ],
    name: "UUPSUnsupportedProxiableUUID",
    type: "error"
  },
  {
    inputs: [],
    name: "Unauthorized",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "currentVersion",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "newVersion",
        type: "uint256"
      }
    ],
    name: "VersionNotIncremented",
    type: "error"
  },
  {
    inputs: [],
    name: "WithdrawFailed",
    type: "error"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "token",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "to",
        type: "address"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      }
    ],
    name: "EmergencyWithdraw",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint64",
        name: "version",
        type: "uint64"
      }
    ],
    name: "Initialized",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "implementation",
        type: "address"
      }
    ],
    name: "Upgraded",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      }
    ],
    name: "YAssetsAllocated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "handler",
        type: "address"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      }
    ],
    name: "YAssetsDistributed",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "handler",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "destination",
        type: "address"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      }
    ],
    name: "YAssetsWithdrawn",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "handler",
        type: "address"
      }
    ],
    name: "YProtocolHandlerRemoved",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address[]",
        name: "handlers",
        type: "address[]"
      },
      {
        indexed: false,
        internalType: "uint256[]",
        name: "allocations",
        type: "uint256[]"
      }
    ],
    name: "YProtocolHandlersSet",
    type: "event"
  },
  {
    inputs: [],
    name: "ALLOCATION_PRECISION",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "UPGRADE_INTERFACE_VERSION",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "VERSION",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "distributeUnallocatedYAsset",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_amount",
        type: "uint256"
      }
    ],
    name: "distributeYAsset",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_token",
        type: "address"
      },
      {
        internalType: "address",
        name: "_to",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "_amount",
        type: "uint256"
      }
    ],
    name: "emergencyWithdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_handler",
        type: "address"
      }
    ],
    name: "getProtocolBalance",
    outputs: [
      {
        internalType: "uint256",
        name: "balance",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getUnallocatedBalance",
    outputs: [
      {
        internalType: "uint256",
        name: "balance",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getYAsset",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getYAssetInfo",
    outputs: [
      {
        internalType: "address",
        name: "asset",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "totalAmount",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getYProtocolHandlers",
    outputs: [
      {
        components: [
          {
            internalType: "address",
            name: "handlerContract",
            type: "address"
          },
          {
            internalType: "uint256",
            name: "allocationPercentage",
            type: "uint256"
          }
        ],
        internalType: "struct YAssetOperationsHandlerTypes.YieldProtocolHandler[]",
        name: "handlers",
        type: "tuple[]"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_proTokenSettings",
        type: "address"
      },
      {
        internalType: "address",
        name: "_yAsset",
        type: "address"
      }
    ],
    name: "initialize",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "proxiableUUID",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address[]",
        name: "_handlers",
        type: "address[]"
      },
      {
        internalType: "uint256[]",
        name: "_allocations",
        type: "uint256[]"
      }
    ],
    name: "setYProtocolHandlers",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newImplementation",
        type: "address"
      },
      {
        internalType: "bytes",
        name: "data",
        type: "bytes"
      }
    ],
    name: "upgradeToAndCall",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_handler",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "_amount",
        type: "uint256"
      }
    ],
    name: "withdrawalYieldAssets",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address[]",
        name: "_handlers",
        type: "address[]"
      },
      {
        internalType: "uint256[]",
        name: "_amounts",
        type: "uint256[]"
      }
    ],
    name: "withdrawalYieldAssetsMultiple",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
];

// abi/AaveV3YieldHandler.json
var AaveV3YieldHandler_default = [
  {
    inputs: [],
    stateMutability: "nonpayable",
    type: "constructor"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "target",
        type: "address"
      }
    ],
    name: "AddressEmptyCode",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "implementation",
        type: "address"
      }
    ],
    name: "ERC1967InvalidImplementation",
    type: "error"
  },
  {
    inputs: [],
    name: "ERC1967NonPayable",
    type: "error"
  },
  {
    inputs: [],
    name: "FailedCall",
    type: "error"
  },
  {
    inputs: [],
    name: "InsufficientBalance",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidAddr",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidAmount",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidInitialization",
    type: "error"
  },
  {
    inputs: [],
    name: "NotInitializing",
    type: "error"
  },
  {
    inputs: [],
    name: "Paused",
    type: "error"
  },
  {
    inputs: [],
    name: "ReentrancyGuardReentrantCall",
    type: "error"
  },
  {
    inputs: [],
    name: "RewardsClaimMismatch",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "token",
        type: "address"
      }
    ],
    name: "SafeERC20FailedOperation",
    type: "error"
  },
  {
    inputs: [],
    name: "UUPSUnauthorizedCallContext",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "slot",
        type: "bytes32"
      }
    ],
    name: "UUPSUnsupportedProxiableUUID",
    type: "error"
  },
  {
    inputs: [],
    name: "Unauthorized",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "currentVersion",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "newVersion",
        type: "uint256"
      }
    ],
    name: "VersionNotIncremented",
    type: "error"
  },
  {
    inputs: [],
    name: "WithdrawFailed",
    type: "error"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "aTokenAddress",
        type: "address"
      }
    ],
    name: "ATokenUpdated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "token",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "to",
        type: "address"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      }
    ],
    name: "EmergencyWithdraw",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "incentivesController",
        type: "address"
      }
    ],
    name: "IncentivesControllerUpdated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint64",
        name: "version",
        type: "uint64"
      }
    ],
    name: "Initialized",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "operationsContract",
        type: "address"
      }
    ],
    name: "OperationsContractUpdated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "implementation",
        type: "address"
      }
    ],
    name: "Upgraded",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256"
      }
    ],
    name: "YieldAssetDeposited",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "actualAmount",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256"
      }
    ],
    name: "YieldAssetWithdrawn",
    type: "event"
  },
  {
    inputs: [],
    name: "UPGRADE_INTERFACE_VERSION",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "VERSION",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      }
    ],
    name: "depositYieldAsset",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_token",
        type: "address"
      },
      {
        internalType: "address",
        name: "_to",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "_amount",
        type: "uint256"
      }
    ],
    name: "emergencyWithdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "getAavePool",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getBalance",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getYieldAsset",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_proTokenSettings",
        type: "address"
      },
      {
        internalType: "address",
        name: "_operationsContract",
        type: "address"
      },
      {
        internalType: "address",
        name: "_aavePool",
        type: "address"
      },
      {
        internalType: "address",
        name: "_yieldAsset",
        type: "address"
      },
      {
        internalType: "address",
        name: "_aToken",
        type: "address"
      }
    ],
    name: "initialize",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "proxiableUUID",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_aToken",
        type: "address"
      }
    ],
    name: "setAToken",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_aavePool",
        type: "address"
      }
    ],
    name: "setAavePool",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_incentivesController",
        type: "address"
      }
    ],
    name: "setIncentivesController",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_operationsContract",
        type: "address"
      }
    ],
    name: "setOperationsContract",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_yieldAsset",
        type: "address"
      }
    ],
    name: "setYieldAsset",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newImplementation",
        type: "address"
      },
      {
        internalType: "bytes",
        name: "data",
        type: "bytes"
      }
    ],
    name: "upgradeToAndCall",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      }
    ],
    name: "withdrawYieldAsset",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "nonpayable",
    type: "function"
  }
];

// abi/ProTokenPlus.json
var ProTokenPlus_default = [
  {
    inputs: [],
    stateMutability: "nonpayable",
    type: "constructor"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "target",
        type: "address"
      }
    ],
    name: "AddressEmptyCode",
    type: "error"
  },
  {
    inputs: [],
    name: "ArrayLengthMismatch",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "minDeposit",
        type: "uint256"
      }
    ],
    name: "BelowMinDeposit",
    type: "error"
  },
  {
    inputs: [],
    name: "CannotCascadeFloorTier",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "positionId",
        type: "uint256"
      }
    ],
    name: "DuplicatePositionId",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "implementation",
        type: "address"
      }
    ],
    name: "ERC1967InvalidImplementation",
    type: "error"
  },
  {
    inputs: [],
    name: "ERC1967NonPayable",
    type: "error"
  },
  {
    inputs: [],
    name: "EmptyPositionArray",
    type: "error"
  },
  {
    inputs: [],
    name: "EnforcedPause",
    type: "error"
  },
  {
    inputs: [],
    name: "ExpectedPause",
    type: "error"
  },
  {
    inputs: [],
    name: "FailedCall",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "requested",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "available",
        type: "uint256"
      }
    ],
    name: "InsufficientBalance",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidAddr",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidAmount",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint8",
        name: "tierId",
        type: "uint8"
      },
      {
        internalType: "uint8",
        name: "targetTierId",
        type: "uint8"
      }
    ],
    name: "InvalidCascadeTarget",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidDuration",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidInitialization",
    type: "error"
  },
  {
    inputs: [],
    name: "NotInitializing",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "positionId",
        type: "uint256"
      }
    ],
    name: "PositionAlreadyCascaded",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "positionId",
        type: "uint256"
      }
    ],
    name: "PositionNotActive",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "positionId",
        type: "uint256"
      }
    ],
    name: "PositionNotFound",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "positionId",
        type: "uint256"
      }
    ],
    name: "PositionNotOwned",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "positionId",
        type: "uint256"
      }
    ],
    name: "PositionNotUnlocked",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "positionId",
        type: "uint256"
      },
      {
        internalType: "uint8",
        name: "expectedTier",
        type: "uint8"
      },
      {
        internalType: "uint8",
        name: "actualTier",
        type: "uint8"
      }
    ],
    name: "PositionTierMismatch",
    type: "error"
  },
  {
    inputs: [],
    name: "ReentrancyGuardReentrantCall",
    type: "error"
  },
  {
    inputs: [],
    name: "TierConfigLengthMismatch",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint8",
        name: "tierId",
        type: "uint8"
      }
    ],
    name: "TierError",
    type: "error"
  },
  {
    inputs: [],
    name: "UUPSUnauthorizedCallContext",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "slot",
        type: "bytes32"
      }
    ],
    name: "UUPSUnsupportedProxiableUUID",
    type: "error"
  },
  {
    inputs: [],
    name: "Unauthorized",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint64",
        name: "unbondingEnd",
        type: "uint64"
      }
    ],
    name: "UnbondingNotComplete",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "unbondingIndex",
        type: "uint256"
      }
    ],
    name: "UnbondingNotFound",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "period",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "maxPeriod",
        type: "uint256"
      }
    ],
    name: "UnbondingPeriodTooLong",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "mainVersion",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "satelliteVersion",
        type: "uint256"
      }
    ],
    name: "VersionMismatch",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "currentVersion",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "newVersion",
        type: "uint256"
      }
    ],
    name: "VersionNotIncremented",
    type: "error"
  },
  {
    inputs: [],
    name: "ZeroAmountPosition",
    type: "error"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "user",
        type: "address"
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "positionId",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "bool",
        name: "autoReup",
        type: "bool"
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "lockExpiry",
        type: "uint64"
      },
      {
        indexed: false,
        internalType: "uint8",
        name: "lockedTierId",
        type: "uint8"
      },
      {
        indexed: false,
        internalType: "uint8",
        name: "unlockedTierId",
        type: "uint8"
      }
    ],
    name: "AutoReupToggled",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint8",
        name: "tierId",
        type: "uint8"
      },
      {
        indexed: false,
        internalType: "uint8",
        name: "targetTierId",
        type: "uint8"
      }
    ],
    name: "CascadeTargetSet",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "user",
        type: "address"
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "positionId",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      }
    ],
    name: "Deposited",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint64",
        name: "version",
        type: "uint64"
      }
    ],
    name: "Initialized",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "oldHandler",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "newHandler",
        type: "address"
      }
    ],
    name: "OperationsHandlerSet",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address",
        name: "account",
        type: "address"
      }
    ],
    name: "Paused",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "user",
        type: "address"
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "positionId",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "newExpiry",
        type: "uint64"
      }
    ],
    name: "PositionAutoReupped",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "user",
        type: "address"
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "positionId",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint8",
        name: "lockedTierId",
        type: "uint8"
      },
      {
        indexed: false,
        internalType: "uint8",
        name: "unlockedTierId",
        type: "uint8"
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "expiry",
        type: "uint64"
      },
      {
        indexed: false,
        internalType: "bool",
        name: "autoReup",
        type: "bool"
      }
    ],
    name: "PositionCreated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "user",
        type: "address"
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "positionId",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "enum ProTokenPlusTypes.PositionStatus",
        name: "newStatus",
        type: "uint8"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint8",
        name: "lockedTierId",
        type: "uint8"
      },
      {
        indexed: false,
        internalType: "uint8",
        name: "unlockedTierId",
        type: "uint8"
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "lockExpiry",
        type: "uint64"
      },
      {
        indexed: false,
        internalType: "bool",
        name: "autoReup",
        type: "bool"
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "activeFromTimestamp",
        type: "uint64"
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "activeToTimestamp",
        type: "uint64"
      }
    ],
    name: "PositionDeactivated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "user",
        type: "address"
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "newPositionId",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "oldPositionId",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "oldPositionAmount",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "addedAmount",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "totalAmount",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint8",
        name: "lockedTierId",
        type: "uint8"
      },
      {
        indexed: false,
        internalType: "uint8",
        name: "unlockedTierId",
        type: "uint8"
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "oldPositionLockExpiry",
        type: "uint64"
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "newExpiry",
        type: "uint64"
      },
      {
        indexed: false,
        internalType: "bool",
        name: "autoReup",
        type: "bool"
      }
    ],
    name: "PositionMerged",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "user",
        type: "address"
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "newPositionId",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256[]",
        name: "relocatedPositionIds",
        type: "uint256[]"
      },
      {
        indexed: false,
        internalType: "uint8",
        name: "fromTierId",
        type: "uint8"
      },
      {
        indexed: false,
        internalType: "uint8",
        name: "toTierId",
        type: "uint8"
      },
      {
        indexed: false,
        internalType: "uint8",
        name: "newUnlockedTierId",
        type: "uint8"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "totalAmount",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "newExpiry",
        type: "uint64"
      },
      {
        indexed: false,
        internalType: "bool",
        name: "autoReup",
        type: "bool"
      }
    ],
    name: "PositionRelocated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "oldProUSD",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "newProUSD",
        type: "address"
      }
    ],
    name: "ProUSDSet",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint8",
        name: "tierId",
        type: "uint8"
      },
      {
        indexed: false,
        internalType: "string",
        name: "name",
        type: "string"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "duration",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "minDeposit",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "bool",
        name: "isDepositable",
        type: "bool"
      }
    ],
    name: "TierAdded",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint8",
        name: "tierId",
        type: "uint8"
      },
      {
        indexed: false,
        internalType: "string",
        name: "name",
        type: "string"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "duration",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "minDeposit",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "bool",
        name: "isDepositable",
        type: "bool"
      },
      {
        indexed: false,
        internalType: "bool",
        name: "isActive",
        type: "bool"
      }
    ],
    name: "TierConfigUpdated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "oldPeriod",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "newPeriod",
        type: "uint256"
      }
    ],
    name: "UnbondingPeriodSet",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "user",
        type: "address"
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "unbondingIndex",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "unbondingEnd",
        type: "uint64"
      },
      {
        components: [
          {
            internalType: "uint256",
            name: "positionId",
            type: "uint256"
          },
          {
            internalType: "uint256",
            name: "amountUsed",
            type: "uint256"
          },
          {
            internalType: "uint256",
            name: "remainderPositionId",
            type: "uint256"
          }
        ],
        indexed: false,
        internalType: "struct ProTokenPlusTypes.WithdrawRequestPosition[]",
        name: "positionsUsed",
        type: "tuple[]"
      }
    ],
    name: "UnbondingStarted",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "user",
        type: "address"
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "newPositionId",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256[]",
        name: "mergedPositionIds",
        type: "uint256[]"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "totalAmount",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint8",
        name: "tierId",
        type: "uint8"
      }
    ],
    name: "UnlockedMerged",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address",
        name: "account",
        type: "address"
      }
    ],
    name: "Unpaused",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "implementation",
        type: "address"
      }
    ],
    name: "Upgraded",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "user",
        type: "address"
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "unbondingIndex",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      }
    ],
    name: "Withdrawn",
    type: "event"
  },
  {
    inputs: [],
    name: "UPGRADE_INTERFACE_VERSION",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "VERSION",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint8",
        name: "tierId",
        type: "uint8"
      },
      {
        components: [
          {
            internalType: "string",
            name: "name",
            type: "string"
          },
          {
            internalType: "uint256",
            name: "duration",
            type: "uint256"
          },
          {
            internalType: "uint256",
            name: "minDeposit",
            type: "uint256"
          },
          {
            internalType: "bool",
            name: "isDepositable",
            type: "bool"
          },
          {
            internalType: "bool",
            name: "isActive",
            type: "bool"
          }
        ],
        internalType: "struct ProTokenPlusTypes.TierConfig",
        name: "config",
        type: "tuple"
      },
      {
        internalType: "uint8",
        name: "cascadeTargetTierId",
        type: "uint8"
      }
    ],
    name: "addTier",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256[]",
        name: "unbondingIndices",
        type: "uint256[]"
      },
      {
        internalType: "uint256[]",
        name: "unlockedPositionsToMerge",
        type: "uint256[]"
      }
    ],
    name: "completeWithdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint8",
        name: "tierId",
        type: "uint8"
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      },
      {
        internalType: "bool",
        name: "autoReup",
        type: "bool"
      },
      {
        internalType: "uint256[]",
        name: "unlockedPositionsToMerge",
        type: "uint256[]"
      }
    ],
    name: "deposit",
    outputs: [
      {
        internalType: "uint256",
        name: "positionId",
        type: "uint256"
      }
    ],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "positionId",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      },
      {
        internalType: "uint256[]",
        name: "unlockedPositionsToMerge",
        type: "uint256[]"
      }
    ],
    name: "depositAndMerge",
    outputs: [
      {
        internalType: "uint256",
        name: "newPositionId",
        type: "uint256"
      }
    ],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "user",
        type: "address"
      }
    ],
    name: "getActiveUnbondingIndices",
    outputs: [
      {
        internalType: "uint256[]",
        name: "indices",
        type: "uint256[]"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint8[]",
        name: "tierIdsToQuery",
        type: "uint8[]"
      }
    ],
    name: "getTiers",
    outputs: [
      {
        components: [
          {
            internalType: "uint8",
            name: "tierId",
            type: "uint8"
          },
          {
            components: [
              {
                internalType: "string",
                name: "name",
                type: "string"
              },
              {
                internalType: "uint256",
                name: "duration",
                type: "uint256"
              },
              {
                internalType: "uint256",
                name: "minDeposit",
                type: "uint256"
              },
              {
                internalType: "bool",
                name: "isDepositable",
                type: "bool"
              },
              {
                internalType: "bool",
                name: "isActive",
                type: "bool"
              }
            ],
            internalType: "struct ProTokenPlusTypes.TierConfig",
            name: "config",
            type: "tuple"
          },
          {
            internalType: "uint8",
            name: "cascadeTarget",
            type: "uint8"
          }
        ],
        internalType: "struct ProTokenPlusTypes.TierConfigResponse[]",
        name: "responses",
        type: "tuple[]"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "user",
        type: "address"
      }
    ],
    name: "getUnbondingRequestCount",
    outputs: [
      {
        internalType: "uint256",
        name: "count",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "user",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "startIndex",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "count",
        type: "uint256"
      }
    ],
    name: "getUnbondingRequests",
    outputs: [
      {
        components: [
          {
            internalType: "uint256",
            name: "amount",
            type: "uint256"
          },
          {
            internalType: "uint64",
            name: "unbondingEnd",
            type: "uint64"
          },
          {
            internalType: "bool",
            name: "isActive",
            type: "bool"
          },
          {
            components: [
              {
                internalType: "uint256",
                name: "positionId",
                type: "uint256"
              },
              {
                internalType: "uint256",
                name: "amountUsed",
                type: "uint256"
              },
              {
                internalType: "uint256",
                name: "remainderPositionId",
                type: "uint256"
              }
            ],
            internalType: "struct ProTokenPlusTypes.WithdrawRequestPosition[]",
            name: "positionsUsed",
            type: "tuple[]"
          }
        ],
        internalType: "struct ProTokenPlusTypes.UnbondingRequest[]",
        name: "requests",
        type: "tuple[]"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "user",
        type: "address"
      }
    ],
    name: "getUserBalanceSummary",
    outputs: [
      {
        components: [
          {
            internalType: "uint256",
            name: "totalLocked",
            type: "uint256"
          },
          {
            internalType: "uint256",
            name: "totalUnlocked",
            type: "uint256"
          },
          {
            internalType: "uint256",
            name: "totalUnbonding",
            type: "uint256"
          },
          {
            internalType: "uint256",
            name: "activePositionCount",
            type: "uint256"
          },
          {
            components: [
              {
                internalType: "uint8",
                name: "tierId",
                type: "uint8"
              },
              {
                internalType: "uint256",
                name: "lockedAmount",
                type: "uint256"
              },
              {
                internalType: "uint256",
                name: "unlockedAmount",
                type: "uint256"
              }
            ],
            internalType: "struct ProTokenPlusTypes.TierBalance[]",
            name: "tierBalances",
            type: "tuple[]"
          }
        ],
        internalType: "struct ProTokenPlusTypes.UserBalanceSummary",
        name: "summary",
        type: "tuple"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "user",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "startIndex",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "count",
        type: "uint256"
      },
      {
        internalType: "bool",
        name: "activeOnly",
        type: "bool"
      }
    ],
    name: "getUserPositionIds",
    outputs: [
      {
        internalType: "uint256[]",
        name: "positionIdsResult",
        type: "uint256[]"
      },
      {
        internalType: "uint256",
        name: "totalCount",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256[]",
        name: "positionIdsToQuery",
        type: "uint256[]"
      }
    ],
    name: "getUserPositions",
    outputs: [
      {
        components: [
          {
            internalType: "uint256",
            name: "positionId",
            type: "uint256"
          },
          {
            internalType: "address",
            name: "owner",
            type: "address"
          },
          {
            internalType: "uint256",
            name: "amount",
            type: "uint256"
          },
          {
            internalType: "uint8",
            name: "lockedTierId",
            type: "uint8"
          },
          {
            internalType: "uint8",
            name: "unlockedTierId",
            type: "uint8"
          },
          {
            internalType: "uint8",
            name: "effectiveTierId",
            type: "uint8"
          },
          {
            internalType: "uint64",
            name: "lockExpiry",
            type: "uint64"
          },
          {
            internalType: "bool",
            name: "autoReup",
            type: "bool"
          },
          {
            internalType: "enum ProTokenPlusTypes.PositionState",
            name: "state",
            type: "uint8"
          },
          {
            internalType: "uint64",
            name: "activeFromTimestamp",
            type: "uint64"
          },
          {
            internalType: "uint64",
            name: "activeToTimestamp",
            type: "uint64"
          },
          {
            internalType: "enum ProTokenPlusTypes.PositionStatus",
            name: "status",
            type: "uint8"
          }
        ],
        internalType: "struct ProTokenPlusTypes.PositionView[]",
        name: "responses",
        type: "tuple[]"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_proTokenSettings",
        type: "address"
      },
      {
        internalType: "address",
        name: "_proUSD",
        type: "address"
      },
      {
        internalType: "uint8[]",
        name: "_tierIds",
        type: "uint8[]"
      },
      {
        components: [
          {
            internalType: "string",
            name: "name",
            type: "string"
          },
          {
            internalType: "uint256",
            name: "duration",
            type: "uint256"
          },
          {
            internalType: "uint256",
            name: "minDeposit",
            type: "uint256"
          },
          {
            internalType: "bool",
            name: "isDepositable",
            type: "bool"
          },
          {
            internalType: "bool",
            name: "isActive",
            type: "bool"
          }
        ],
        internalType: "struct ProTokenPlusTypes.TierConfig[]",
        name: "_tierConfigs",
        type: "tuple[]"
      },
      {
        internalType: "uint8[]",
        name: "_cascadeTargetTierIds",
        type: "uint8[]"
      }
    ],
    name: "initialize",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256[]",
        name: "positionIds",
        type: "uint256[]"
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      },
      {
        internalType: "uint256[]",
        name: "unlockedPositionsToMerge",
        type: "uint256[]"
      }
    ],
    name: "initiateWithdraw",
    outputs: [
      {
        internalType: "uint256",
        name: "unbondingIndex",
        type: "uint256"
      }
    ],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "isPaused",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "nextPositionId",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "operationsHandler",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "pause",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "paused",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "proTokenSettings",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "proUSD",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "proxiableUUID",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256[]",
        name: "positionIds",
        type: "uint256[]"
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      },
      {
        internalType: "uint8",
        name: "toTierId",
        type: "uint8"
      },
      {
        internalType: "bool",
        name: "autoReup",
        type: "bool"
      },
      {
        internalType: "uint256[]",
        name: "unlockedPositionsToMerge",
        type: "uint256[]"
      }
    ],
    name: "relock",
    outputs: [
      {
        internalType: "uint256",
        name: "newPositionId",
        type: "uint256"
      }
    ],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256[]",
        name: "positionIds",
        type: "uint256[]"
      },
      {
        internalType: "bool[]",
        name: "autoReupValues",
        type: "bool[]"
      },
      {
        internalType: "uint256[]",
        name: "unlockedPositionsToMerge",
        type: "uint256[]"
      }
    ],
    name: "setAutoReup",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint8",
        name: "tierId",
        type: "uint8"
      },
      {
        internalType: "uint8",
        name: "targetTierId",
        type: "uint8"
      }
    ],
    name: "setCascadeTarget",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_operationsHandler",
        type: "address"
      }
    ],
    name: "setOperationsHandler",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_proUSD",
        type: "address"
      }
    ],
    name: "setProUSD",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "period",
        type: "uint256"
      }
    ],
    name: "setUnbondingPeriod",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "totalUnbonding",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "unbondingPeriod",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256[]",
        name: "positionIds",
        type: "uint256[]"
      }
    ],
    name: "unlockedMerge",
    outputs: [
      {
        internalType: "uint256",
        name: "newPositionId",
        type: "uint256"
      }
    ],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "unpause",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint8",
        name: "tierId",
        type: "uint8"
      },
      {
        internalType: "string",
        name: "name",
        type: "string"
      },
      {
        internalType: "uint256",
        name: "duration",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "minDeposit",
        type: "uint256"
      },
      {
        internalType: "bool",
        name: "isDepositable",
        type: "bool"
      },
      {
        internalType: "bool",
        name: "isActive",
        type: "bool"
      }
    ],
    name: "updateTierConfig",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newImplementation",
        type: "address"
      },
      {
        internalType: "bytes",
        name: "data",
        type: "bytes"
      }
    ],
    name: "upgradeToAndCall",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  }
];

// abi/ProTokenPlusRewardDistributor.json
var ProTokenPlusRewardDistributor_default = [
  {
    inputs: [],
    stateMutability: "nonpayable",
    type: "constructor"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "target",
        type: "address"
      }
    ],
    name: "AddressEmptyCode",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "distributionId",
        type: "uint256"
      },
      {
        internalType: "address",
        name: "user",
        type: "address"
      }
    ],
    name: "AlreadyClaimed",
    type: "error"
  },
  {
    inputs: [],
    name: "ArrayLengthMismatch",
    type: "error"
  },
  {
    inputs: [],
    name: "ContractPaused",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "distributionId",
        type: "uint256"
      }
    ],
    name: "DistributionNotFound",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "distributionId",
        type: "uint256"
      }
    ],
    name: "DistributionPausedError",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "implementation",
        type: "address"
      }
    ],
    name: "ERC1967InvalidImplementation",
    type: "error"
  },
  {
    inputs: [],
    name: "ERC1967NonPayable",
    type: "error"
  },
  {
    inputs: [],
    name: "EnforcedPause",
    type: "error"
  },
  {
    inputs: [],
    name: "ExpectedPause",
    type: "error"
  },
  {
    inputs: [],
    name: "FailedCall",
    type: "error"
  },
  {
    inputs: [],
    name: "InsufficientDistributionFunds",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidAddr",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidAmount",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidInitialization",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidMerkleRoot",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidPeriod",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidProof",
    type: "error"
  },
  {
    inputs: [],
    name: "NotInitializing",
    type: "error"
  },
  {
    inputs: [],
    name: "ReentrancyGuardReentrantCall",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "token",
        type: "address"
      }
    ],
    name: "SafeERC20FailedOperation",
    type: "error"
  },
  {
    inputs: [],
    name: "UUPSUnauthorizedCallContext",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "slot",
        type: "bytes32"
      }
    ],
    name: "UUPSUnsupportedProxiableUUID",
    type: "error"
  },
  {
    inputs: [],
    name: "Unauthorized",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "distributionId",
        type: "uint256"
      }
    ],
    name: "UnclaimedAlreadyWithdrawn",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "currentVersion",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "newVersion",
        type: "uint256"
      }
    ],
    name: "VersionNotIncremented",
    type: "error"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "distributionId",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "merkleRoot",
        type: "bytes32"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "totalAmount",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "string",
        name: "description",
        type: "string"
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "periodFromTimestamp",
        type: "uint64"
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "periodToTimestamp",
        type: "uint64"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "totalWeight",
        type: "uint256"
      },
      {
        components: [
          {
            internalType: "uint256",
            name: "tierId",
            type: "uint256"
          },
          {
            internalType: "uint256",
            name: "multiplier",
            type: "uint256"
          }
        ],
        indexed: false,
        internalType: "struct ProTokenPlusRewardDistributorTypes.TierData[]",
        name: "tiers",
        type: "tuple[]"
      }
    ],
    name: "DistributionCreated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "distributionId",
        type: "uint256"
      }
    ],
    name: "DistributionPaused",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "distributionId",
        type: "uint256"
      }
    ],
    name: "DistributionUnpaused",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint64",
        name: "version",
        type: "uint64"
      }
    ],
    name: "Initialized",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address",
        name: "account",
        type: "address"
      }
    ],
    name: "Paused",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "oldProUSD",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "newProUSD",
        type: "address"
      }
    ],
    name: "ProUSDSet",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "user",
        type: "address"
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "distributionId",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      }
    ],
    name: "RewardClaimed",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "distributionId",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      },
      {
        indexed: true,
        internalType: "address",
        name: "recipient",
        type: "address"
      }
    ],
    name: "UnclaimedWithdrawn",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address",
        name: "account",
        type: "address"
      }
    ],
    name: "Unpaused",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "implementation",
        type: "address"
      }
    ],
    name: "Upgraded",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "oldVault",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "newVault",
        type: "address"
      }
    ],
    name: "VaultSet",
    type: "event"
  },
  {
    inputs: [],
    name: "UPGRADE_INTERFACE_VERSION",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "VERSION",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256[]",
        name: "distributionIds",
        type: "uint256[]"
      },
      {
        internalType: "uint256[]",
        name: "amounts",
        type: "uint256[]"
      },
      {
        internalType: "bytes32[][]",
        name: "proofs",
        type: "bytes32[][]"
      }
    ],
    name: "claimRewardBatch",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      },
      {
        internalType: "address",
        name: "",
        type: "address"
      }
    ],
    name: "claimedAmounts",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "merkleRoot",
        type: "bytes32"
      },
      {
        internalType: "uint256",
        name: "totalAmount",
        type: "uint256"
      },
      {
        internalType: "string",
        name: "description",
        type: "string"
      },
      {
        internalType: "uint64",
        name: "periodFromTimestamp",
        type: "uint64"
      },
      {
        internalType: "uint64",
        name: "periodToTimestamp",
        type: "uint64"
      },
      {
        internalType: "uint256",
        name: "totalWeight",
        type: "uint256"
      },
      {
        components: [
          {
            internalType: "uint256",
            name: "tierId",
            type: "uint256"
          },
          {
            internalType: "uint256",
            name: "multiplier",
            type: "uint256"
          }
        ],
        internalType: "struct ProTokenPlusRewardDistributorTypes.TierData[]",
        name: "tiers",
        type: "tuple[]"
      }
    ],
    name: "createDistribution",
    outputs: [
      {
        internalType: "uint256",
        name: "distributionId",
        type: "uint256"
      }
    ],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    name: "distributions",
    outputs: [
      {
        internalType: "uint256",
        name: "distributionId",
        type: "uint256"
      },
      {
        internalType: "bytes32",
        name: "merkleRoot",
        type: "bytes32"
      },
      {
        internalType: "uint256",
        name: "totalAmount",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "claimedAmount",
        type: "uint256"
      },
      {
        internalType: "uint64",
        name: "createdAt",
        type: "uint64"
      },
      {
        internalType: "string",
        name: "description",
        type: "string"
      },
      {
        internalType: "uint64",
        name: "periodFromTimestamp",
        type: "uint64"
      },
      {
        internalType: "uint64",
        name: "periodToTimestamp",
        type: "uint64"
      },
      {
        internalType: "uint256",
        name: "totalWeight",
        type: "uint256"
      },
      {
        internalType: "bool",
        name: "isPaused",
        type: "bool"
      },
      {
        internalType: "bool",
        name: "unclaimedWithdrawn",
        type: "bool"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getActiveDistributions",
    outputs: [
      {
        components: [
          {
            internalType: "uint256",
            name: "distributionId",
            type: "uint256"
          },
          {
            internalType: "bytes32",
            name: "merkleRoot",
            type: "bytes32"
          },
          {
            internalType: "uint256",
            name: "totalAmount",
            type: "uint256"
          },
          {
            internalType: "uint256",
            name: "claimedAmount",
            type: "uint256"
          },
          {
            internalType: "uint64",
            name: "createdAt",
            type: "uint64"
          },
          {
            internalType: "string",
            name: "description",
            type: "string"
          },
          {
            internalType: "uint64",
            name: "periodFromTimestamp",
            type: "uint64"
          },
          {
            internalType: "uint64",
            name: "periodToTimestamp",
            type: "uint64"
          },
          {
            internalType: "uint256",
            name: "totalWeight",
            type: "uint256"
          },
          {
            internalType: "bool",
            name: "isPaused",
            type: "bool"
          },
          {
            internalType: "bool",
            name: "unclaimedWithdrawn",
            type: "bool"
          },
          {
            components: [
              {
                internalType: "uint256",
                name: "tierId",
                type: "uint256"
              },
              {
                internalType: "uint256",
                name: "multiplier",
                type: "uint256"
              }
            ],
            internalType: "struct ProTokenPlusRewardDistributorTypes.TierData[]",
            name: "tiers",
            type: "tuple[]"
          }
        ],
        internalType: "struct ProTokenPlusRewardDistributorTypes.Distribution[]",
        name: "result",
        type: "tuple[]"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getAllDistributions",
    outputs: [
      {
        components: [
          {
            internalType: "uint256",
            name: "distributionId",
            type: "uint256"
          },
          {
            internalType: "bytes32",
            name: "merkleRoot",
            type: "bytes32"
          },
          {
            internalType: "uint256",
            name: "totalAmount",
            type: "uint256"
          },
          {
            internalType: "uint256",
            name: "claimedAmount",
            type: "uint256"
          },
          {
            internalType: "uint64",
            name: "createdAt",
            type: "uint64"
          },
          {
            internalType: "string",
            name: "description",
            type: "string"
          },
          {
            internalType: "uint64",
            name: "periodFromTimestamp",
            type: "uint64"
          },
          {
            internalType: "uint64",
            name: "periodToTimestamp",
            type: "uint64"
          },
          {
            internalType: "uint256",
            name: "totalWeight",
            type: "uint256"
          },
          {
            internalType: "bool",
            name: "isPaused",
            type: "bool"
          },
          {
            internalType: "bool",
            name: "unclaimedWithdrawn",
            type: "bool"
          },
          {
            components: [
              {
                internalType: "uint256",
                name: "tierId",
                type: "uint256"
              },
              {
                internalType: "uint256",
                name: "multiplier",
                type: "uint256"
              }
            ],
            internalType: "struct ProTokenPlusRewardDistributorTypes.TierData[]",
            name: "tiers",
            type: "tuple[]"
          }
        ],
        internalType: "struct ProTokenPlusRewardDistributorTypes.Distribution[]",
        name: "result",
        type: "tuple[]"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "distributionId",
        type: "uint256"
      },
      {
        internalType: "address",
        name: "user",
        type: "address"
      }
    ],
    name: "getClaimedAmount",
    outputs: [
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "distributionId",
        type: "uint256"
      }
    ],
    name: "getDistribution",
    outputs: [
      {
        components: [
          {
            internalType: "uint256",
            name: "distributionId",
            type: "uint256"
          },
          {
            internalType: "bytes32",
            name: "merkleRoot",
            type: "bytes32"
          },
          {
            internalType: "uint256",
            name: "totalAmount",
            type: "uint256"
          },
          {
            internalType: "uint256",
            name: "claimedAmount",
            type: "uint256"
          },
          {
            internalType: "uint64",
            name: "createdAt",
            type: "uint64"
          },
          {
            internalType: "string",
            name: "description",
            type: "string"
          },
          {
            internalType: "uint64",
            name: "periodFromTimestamp",
            type: "uint64"
          },
          {
            internalType: "uint64",
            name: "periodToTimestamp",
            type: "uint64"
          },
          {
            internalType: "uint256",
            name: "totalWeight",
            type: "uint256"
          },
          {
            internalType: "bool",
            name: "isPaused",
            type: "bool"
          },
          {
            internalType: "bool",
            name: "unclaimedWithdrawn",
            type: "bool"
          },
          {
            components: [
              {
                internalType: "uint256",
                name: "tierId",
                type: "uint256"
              },
              {
                internalType: "uint256",
                name: "multiplier",
                type: "uint256"
              }
            ],
            internalType: "struct ProTokenPlusRewardDistributorTypes.TierData[]",
            name: "tiers",
            type: "tuple[]"
          }
        ],
        internalType: "struct ProTokenPlusRewardDistributorTypes.Distribution",
        name: "distribution",
        type: "tuple"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256[]",
        name: "distributionIds",
        type: "uint256[]"
      },
      {
        internalType: "address",
        name: "user",
        type: "address"
      }
    ],
    name: "hasClaimed",
    outputs: [
      {
        internalType: "bool[]",
        name: "claimed",
        type: "bool[]"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_proTokenSettings",
        type: "address"
      },
      {
        internalType: "address",
        name: "_proUSD",
        type: "address"
      },
      {
        internalType: "address",
        name: "_vault",
        type: "address"
      }
    ],
    name: "initialize",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "isPaused",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "nextDistributionId",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "pause",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "distributionId",
        type: "uint256"
      }
    ],
    name: "pauseDistribution",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "paused",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "proTokenSettings",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "proUSD",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "proxiableUUID",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_proUSD",
        type: "address"
      }
    ],
    name: "setProUSD",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_vault",
        type: "address"
      }
    ],
    name: "setVault",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "unpause",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "distributionId",
        type: "uint256"
      }
    ],
    name: "unpauseDistribution",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newImplementation",
        type: "address"
      },
      {
        internalType: "bytes",
        name: "data",
        type: "bytes"
      }
    ],
    name: "upgradeToAndCall",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [],
    name: "vault",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "distributionId",
        type: "uint256"
      },
      {
        internalType: "address",
        name: "user",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      },
      {
        internalType: "bytes32[]",
        name: "proof",
        type: "bytes32[]"
      }
    ],
    name: "verifyProof",
    outputs: [
      {
        internalType: "bool",
        name: "valid",
        type: "bool"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "distributionId",
        type: "uint256"
      },
      {
        internalType: "address",
        name: "recipient",
        type: "address"
      }
    ],
    name: "withdrawUnclaimed",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
];

// src/contracts.ts
var oracleRedStoneAdaptorAbi = OracleRedStoneAdaptor_default;
var oracleAlgebraAdaptorAbi = OracleAlgebraAdaptor_default;
var oracleChainlinkPushAdaptorAbi = OracleChainlinkPushAdaptor_default;
var proTokenAbi = ProToken_default;
var proTokenOperationsAbi = ProTokenOperations_default;
var proTokenUnmintHandlerAbi = ProTokenUnmintHandler_default;
var proTokenSettingsAbi = ProTokenSettings_default;
var erc20Abi = ERC20_default;
var yAssetOperationsHandlerAbi = YAssetOperationsHandler_default;
var aaveV3YieldHandlerAbi = AaveV3YieldHandler_default;
var proTokenPlusAbi = ProTokenPlus_default;
var proTokenPlusRewardDistributorAbi = ProTokenPlusRewardDistributor_default;

export { aaveV3YieldHandlerAbi, erc20Abi, oracleAlgebraAdaptorAbi, oracleChainlinkPushAdaptorAbi, oracleRedStoneAdaptorAbi, proTokenAbi, proTokenOperationsAbi, proTokenPlusAbi, proTokenPlusRewardDistributorAbi, proTokenSettingsAbi, proTokenUnmintHandlerAbi, yAssetOperationsHandlerAbi };
//# sourceMappingURL=index.mjs.map
//# sourceMappingURL=index.mjs.map