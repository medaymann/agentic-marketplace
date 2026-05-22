/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/basira.json`.
 */
export type Basira = {
  "address": "9Lc7odoQ3TWXo6yZWnYnGXmAsFNP3Gh6NYgxNhhaxvkj",
  "metadata": {
    "name": "basira",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Basira — agent marketplace on Solana"
  },
  "instructions": [
    {
      "name": "approveSol",
      "discriminator": [
        0,
        133,
        28,
        117,
        77,
        187,
        122,
        61
      ],
      "accounts": [
        {
          "name": "poster",
          "writable": true,
          "signer": true
        },
        {
          "name": "taskAccount",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "agentWallet",
          "writable": true
        },
        {
          "name": "agentAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "agentWallet"
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true,
          "address": "Bddo2ek21cs8SmArWa7c3GTu8VQnAiKzs7fc1T3AF2hc"
        }
      ],
      "args": []
    },
    {
      "name": "approveUsdc",
      "discriminator": [
        127,
        20,
        49,
        13,
        201,
        35,
        48,
        35
      ],
      "accounts": [
        {
          "name": "poster",
          "writable": true,
          "signer": true
        },
        {
          "name": "taskAccount",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "agentWallet"
        },
        {
          "name": "agentAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "agentWallet"
              }
            ]
          }
        },
        {
          "name": "treasury",
          "address": "Bddo2ek21cs8SmArWa7c3GTu8VQnAiKzs7fc1T3AF2hc"
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "vaultTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "agentTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "agentWallet"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "treasuryTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "treasury"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "assignAgent",
      "discriminator": [
        146,
        145,
        237,
        81,
        75,
        46,
        30,
        190
      ],
      "accounts": [
        {
          "name": "poster",
          "signer": true
        },
        {
          "name": "taskAccount",
          "writable": true
        },
        {
          "name": "agentAccount",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "agent_account.wallet",
                "account": "agentAccount"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "cancelTaskSol",
      "discriminator": [
        191,
        161,
        223,
        128,
        203,
        112,
        190,
        238
      ],
      "accounts": [
        {
          "name": "poster",
          "writable": true,
          "signer": true
        },
        {
          "name": "taskAccount",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "cancelTaskUsdc",
      "discriminator": [
        255,
        129,
        200,
        163,
        1,
        240,
        239,
        176
      ],
      "accounts": [
        {
          "name": "poster",
          "writable": true,
          "signer": true
        },
        {
          "name": "taskAccount",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "vaultTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "posterTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "poster"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "claimAfterTimeoutSol",
      "discriminator": [
        24,
        166,
        188,
        18,
        29,
        157,
        223,
        191
      ],
      "accounts": [
        {
          "name": "caller",
          "signer": true
        },
        {
          "name": "taskAccount",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "posterWallet",
          "writable": true
        },
        {
          "name": "agentWallet",
          "writable": true
        },
        {
          "name": "agentAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "agentWallet"
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true,
          "address": "Bddo2ek21cs8SmArWa7c3GTu8VQnAiKzs7fc1T3AF2hc"
        }
      ],
      "args": []
    },
    {
      "name": "claimAfterTimeoutUsdc",
      "discriminator": [
        253,
        210,
        113,
        223,
        18,
        205,
        228,
        109
      ],
      "accounts": [
        {
          "name": "caller",
          "writable": true,
          "signer": true
        },
        {
          "name": "taskAccount",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "posterWallet",
          "writable": true
        },
        {
          "name": "agentWallet"
        },
        {
          "name": "agentAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "agentWallet"
              }
            ]
          }
        },
        {
          "name": "treasury",
          "address": "Bddo2ek21cs8SmArWa7c3GTu8VQnAiKzs7fc1T3AF2hc"
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "vaultTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "agentTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "agentWallet"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "treasuryTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "treasury"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "createTaskSol",
      "discriminator": [
        85,
        19,
        49,
        210,
        151,
        134,
        132,
        180
      ],
      "accounts": [
        {
          "name": "poster",
          "writable": true,
          "signer": true
        },
        {
          "name": "taskAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  97,
                  115,
                  107
                ]
              },
              {
                "kind": "arg",
                "path": "taskId"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "taskId"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "taskId",
          "type": {
            "array": [
              "u8",
              16
            ]
          }
        },
        {
          "name": "mode",
          "type": {
            "defined": {
              "name": "taskMode"
            }
          }
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "deadline",
          "type": "i64"
        },
        {
          "name": "assignedAgent",
          "type": {
            "option": "pubkey"
          }
        }
      ]
    },
    {
      "name": "createTaskUsdc",
      "discriminator": [
        14,
        109,
        238,
        219,
        164,
        210,
        232,
        231
      ],
      "accounts": [
        {
          "name": "poster",
          "writable": true,
          "signer": true
        },
        {
          "name": "taskAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  97,
                  115,
                  107
                ]
              },
              {
                "kind": "arg",
                "path": "taskId"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "taskId"
              }
            ]
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "posterTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "poster"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "vaultTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "taskId",
          "type": {
            "array": [
              "u8",
              16
            ]
          }
        },
        {
          "name": "mode",
          "type": {
            "defined": {
              "name": "taskMode"
            }
          }
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "deadline",
          "type": "i64"
        },
        {
          "name": "assignedAgent",
          "type": {
            "option": "pubkey"
          }
        }
      ]
    },
    {
      "name": "expireTaskSol",
      "discriminator": [
        104,
        222,
        130,
        254,
        41,
        19,
        128,
        222
      ],
      "accounts": [
        {
          "name": "caller",
          "signer": true
        },
        {
          "name": "taskAccount",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "posterWallet",
          "writable": true
        },
        {
          "name": "agentAccount",
          "docs": [
            "Optional agent account — present only when an agent was assigned. The",
            "caller is responsible for passing it; the program enforces that, when",
            "`task.assigned_agent` is Some, this account exists and matches."
          ],
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "agent_account.wallet",
                "account": "agentAccount"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "expireTaskUsdc",
      "discriminator": [
        195,
        6,
        216,
        236,
        168,
        228,
        158,
        46
      ],
      "accounts": [
        {
          "name": "caller",
          "signer": true
        },
        {
          "name": "taskAccount",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "posterWallet",
          "writable": true
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "vaultTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "posterTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "posterWallet"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "agentAccount",
          "docs": [
            "Optional: present only when an agent was assigned (to take the penalty)."
          ],
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "agent_account.wallet",
                "account": "agentAccount"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "openDispute",
      "discriminator": [
        137,
        25,
        99,
        119,
        23,
        223,
        161,
        42
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "taskAccount",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "registerAgent",
      "discriminator": [
        135,
        157,
        66,
        195,
        2,
        113,
        175,
        30
      ],
      "accounts": [
        {
          "name": "platformAuthority",
          "writable": true,
          "signer": true,
          "address": "8tgD8JGUVtAw7vSrVrp9qU8DoDrEFfBdr8ZbpovMJQmV"
        },
        {
          "name": "agentAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "agentWallet"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "agentWallet",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "rejectAssignmentSol",
      "discriminator": [
        184,
        41,
        18,
        103,
        63,
        243,
        185,
        83
      ],
      "accounts": [
        {
          "name": "agent",
          "signer": true
        },
        {
          "name": "taskAccount",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "posterWallet",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "rejectAssignmentUsdc",
      "discriminator": [
        115,
        148,
        2,
        180,
        223,
        131,
        115,
        11
      ],
      "accounts": [
        {
          "name": "agent",
          "signer": true
        },
        {
          "name": "taskAccount",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "posterWallet",
          "writable": true
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "vaultTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "posterTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "posterWallet"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "resolveDisputeSol",
      "discriminator": [
        17,
        252,
        31,
        28,
        181,
        13,
        132,
        85
      ],
      "accounts": [
        {
          "name": "arbitrator",
          "signer": true,
          "address": "5Gb5kQe83EEQoUgEWtLShUpidb1R589g6yC6V26ANhLR"
        },
        {
          "name": "taskAccount",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "posterWallet",
          "writable": true
        },
        {
          "name": "agentWallet",
          "writable": true
        },
        {
          "name": "agentAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "agentWallet"
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true,
          "address": "Bddo2ek21cs8SmArWa7c3GTu8VQnAiKzs7fc1T3AF2hc"
        }
      ],
      "args": [
        {
          "name": "ruling",
          "type": {
            "defined": {
              "name": "disputeRuling"
            }
          }
        }
      ]
    },
    {
      "name": "resolveDisputeUsdc",
      "discriminator": [
        103,
        249,
        11,
        83,
        254,
        225,
        114,
        0
      ],
      "accounts": [
        {
          "name": "arbitrator",
          "writable": true,
          "signer": true,
          "address": "5Gb5kQe83EEQoUgEWtLShUpidb1R589g6yC6V26ANhLR"
        },
        {
          "name": "taskAccount",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "posterWallet",
          "writable": true
        },
        {
          "name": "agentWallet"
        },
        {
          "name": "agentAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "agentWallet"
              }
            ]
          }
        },
        {
          "name": "treasury",
          "address": "Bddo2ek21cs8SmArWa7c3GTu8VQnAiKzs7fc1T3AF2hc"
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "vaultTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "agentTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "agentWallet"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "posterTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "posterWallet"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "treasuryTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "treasury"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "ruling",
          "type": {
            "defined": {
              "name": "disputeRuling"
            }
          }
        }
      ]
    },
    {
      "name": "submitDeliverable",
      "discriminator": [
        38,
        137,
        64,
        44,
        237,
        11,
        125,
        101
      ],
      "accounts": [
        {
          "name": "platformAuthority",
          "signer": true,
          "address": "8tgD8JGUVtAw7vSrVrp9qU8DoDrEFfBdr8ZbpovMJQmV"
        },
        {
          "name": "taskAccount",
          "writable": true
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "agentAccount",
      "discriminator": [
        241,
        119,
        69,
        140,
        233,
        9,
        112,
        50
      ]
    },
    {
      "name": "escrowVault",
      "discriminator": [
        54,
        84,
        41,
        149,
        160,
        181,
        85,
        114
      ]
    },
    {
      "name": "taskAccount",
      "discriminator": [
        235,
        32,
        10,
        23,
        81,
        60,
        170,
        203
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "deadlineTooSoon",
      "msg": "Deadline must be at least one hour in the future."
    },
    {
      "code": 6001,
      "name": "amountBelowMinimum",
      "msg": "Reward amount is below the configured minimum."
    },
    {
      "code": 6002,
      "name": "invalidTaskStatus",
      "msg": "Task is not in a state that allows this action."
    },
    {
      "code": 6003,
      "name": "bountyMustNotPreassign",
      "msg": "Bounty mode requires no pre-assigned agent at creation."
    },
    {
      "code": 6004,
      "name": "directRequiresAssignedAgent",
      "msg": "Direct mode requires an assigned agent at creation."
    },
    {
      "code": 6005,
      "name": "notAssignedAgent",
      "msg": "Signer is not the assigned agent for this task."
    },
    {
      "code": 6006,
      "name": "notPoster",
      "msg": "Signer is not the poster for this task."
    },
    {
      "code": 6007,
      "name": "notDisputeAuthority",
      "msg": "Signer is not authorized to dispute this task."
    },
    {
      "code": 6008,
      "name": "notArbitrator",
      "msg": "Signer is not the arbitrator."
    },
    {
      "code": 6009,
      "name": "notPlatformAuthority",
      "msg": "Signer is not the platform authority."
    },
    {
      "code": 6010,
      "name": "deadlinePassed",
      "msg": "Submission deadline has passed."
    },
    {
      "code": 6011,
      "name": "timeoutNotElapsed",
      "msg": "Auto-release timeout has not elapsed."
    },
    {
      "code": 6012,
      "name": "taskExpired",
      "msg": "Task is past its deadline; cannot perform this action."
    },
    {
      "code": 6013,
      "name": "alreadyAssigned",
      "msg": "Task already has an assigned agent."
    },
    {
      "code": 6014,
      "name": "currencyMismatch",
      "msg": "Vault currency does not match the task currency."
    },
    {
      "code": 6015,
      "name": "numericOverflow",
      "msg": "Numeric overflow during fee or amount calculation."
    },
    {
      "code": 6016,
      "name": "missingRecipientAccount",
      "msg": "Recipient account is required for this currency path but was not provided."
    },
    {
      "code": 6017,
      "name": "agentAccountMismatch",
      "msg": "Provided agent account does not match the assigned agent on the task."
    }
  ],
  "types": [
    {
      "name": "agentAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "registeredAt",
            "type": "i64"
          },
          {
            "name": "completedCount",
            "type": "u64"
          },
          {
            "name": "disputedCount",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "agentStatus"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "agentStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "active"
          },
          {
            "name": "inactive"
          }
        ]
      }
    },
    {
      "name": "currency",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "sol"
          },
          {
            "name": "usdc"
          }
        ]
      }
    },
    {
      "name": "disputeRuling",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "forAgent"
          },
          {
            "name": "forPoster"
          }
        ]
      }
    },
    {
      "name": "escrowVault",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "taskId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "taskAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "taskId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "posterWallet",
            "type": "pubkey"
          },
          {
            "name": "assignedAgent",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "mode",
            "type": {
              "defined": {
                "name": "taskMode"
              }
            }
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "taskStatus"
              }
            }
          },
          {
            "name": "currency",
            "type": {
              "defined": {
                "name": "currency"
              }
            }
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "deadline",
            "type": "i64"
          },
          {
            "name": "submittedAt",
            "type": {
              "option": "i64"
            }
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "taskMode",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "direct"
          },
          {
            "name": "bounty"
          }
        ]
      }
    },
    {
      "name": "taskStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "created"
          },
          {
            "name": "assigned"
          },
          {
            "name": "submitted"
          },
          {
            "name": "approved"
          },
          {
            "name": "disputed"
          },
          {
            "name": "settled"
          },
          {
            "name": "refunded"
          },
          {
            "name": "expired"
          }
        ]
      }
    }
  ]
};
