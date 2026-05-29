| Concurrency | Pool max conns | Access lookup P95 | Refresh rotation P95 | Revoke cycle P95 | Access RPS | Refresh RPS | Revoke RPS | Errors |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 64 | 4 | 43.85ms | 71.37ms | 177.28ms | 1588.94 | 942.79 | 419.26 | 0 |
| 64 | 8 | 24.86ms | 42.47ms | 85.80ms | 2757.73 | 1719.45 | 785.57 | 0 |
| 64 | 16 | 21.88ms | 22.39ms | 46.70ms | 4258.79 | 3225.09 | 1530.51 | 0 |
| 128 | 16 | 100.12ms | 78.38ms | 98.07ms | 2391.00 | 2391.50 | 1431.90 | 0 |
| 256 | 16 | 53.19ms | 86.12ms | 190.88ms | 4662.76 | 2969.85 | 1361.10 | 0 |

Best observed revoke-cycle P95: concurrency 64, pool 16, 46.70ms.
