import { getObjectiveProfile, type WindowMetrics } from "@continuum/optimization-engine";

import type { CatalogAdSet, OptimizerPortfolio } from "./types";

// Materialized multi-portfolio sample data (from the engine handoff demo:
// make-portfolios.ts + make-catalog.ts). Real Privalia MX export + two
// synthetic portfolios whose weak ad sets trip the pause triggers. The
// catalog carries real Meta ad set IDs for the Settings picker.
// No live Meta / Supabase in this PR.

const RAW_SAMPLE_PORTFOLIOS: OptimizerPortfolio[] = [
 {
  "id": "pf-privalia-installs",
  "name": "Privalia · ACQ · Mobile Installs",
  "objective": "app_install",
  "currency": "MXN",
  "config": {
   "mode": "balanced",
   "periodBudget": 450000,
   "dailyBudget": 15388,
   "velocityCap": 30,
   "cpaTarget": 20
  },
  "snapshots": [
   {
    "id": "6997025259785",
    "name": "mobile:nm:socialmedia:feed-continuum-CDP:facebook.com_instagram.com:purchase.androidapp:continumm:Calzado1-new",
    "status": "active",
    "currentBudget": 982.44,
    "ageDays": 25,
    "audienceType": "remarketing",
    "frequency7d": 1.36,
    "windows": {
     "d3": {
      "spend": 2476.3999999999996,
      "purchases": 51,
      "addToCarts": 14,
      "clicks": 1434,
      "impressions": 45346
     },
     "d7": {
      "spend": 4061.8900000000003,
      "purchases": 102,
      "addToCarts": 58,
      "clicks": 1938,
      "impressions": 71613
     },
     "d14": {
      "spend": 7026.759999999999,
      "purchases": 153,
      "addToCarts": 95,
      "clicks": 2741,
      "impressions": 107561
     }
    }
   },
   {
    "id": "6997025154985",
    "name": "mobile:nm:socialmedia:feed-continuum-General:facebook.com_instagram.com:purchase.androidapp:continumm:UGC-new",
    "status": "active",
    "currentBudget": 806.46,
    "ageDays": 25,
    "audienceType": "prospecting",
    "frequency7d": 1.24,
    "windows": {
     "d3": {
      "spend": 2397.36,
      "purchases": 115,
      "addToCarts": 12,
      "clicks": 844,
      "impressions": 45294
     },
     "d7": {
      "spend": 5644.13,
      "purchases": 251,
      "addToCarts": 66,
      "clicks": 1715,
      "impressions": 100689
     },
     "d14": {
      "spend": 12167.32,
      "purchases": 444,
      "addToCarts": 147,
      "clicks": 3403,
      "impressions": 190614
     }
    }
   },
   {
    "id": "6997025324185",
    "name": "mobile:nm:socialmedia:feed-continuum-Prod-Ind:facebook.com_instagram.com:purchase.androidapp:continumm:IndCalzadoMarca4-new",
    "status": "active",
    "currentBudget": 1200,
    "ageDays": 25,
    "audienceType": "unknown",
    "frequency7d": 1.29,
    "windows": {
     "d3": {
      "spend": 3514.37,
      "purchases": 168,
      "addToCarts": 78,
      "clicks": 1034,
      "impressions": 77835
     },
     "d7": {
      "spend": 8400,
      "purchases": 411,
      "addToCarts": 193,
      "clicks": 2256,
      "impressions": 193363
     },
     "d14": {
      "spend": 17514.780000000002,
      "purchases": 739,
      "addToCarts": 462,
      "clicks": 3755,
      "impressions": 364066
     }
    }
   },
   {
    "id": "6979863077585",
    "name": "mobile:nm:socialmedia:feed-continuum-General:facebook.com_instagram.com:purchase.androidapp:continumm:Catalogo2",
    "status": "active",
    "currentBudget": 4611.55,
    "ageDays": 30,
    "audienceType": "prospecting",
    "frequency7d": 1.4,
    "windows": {
     "d3": {
      "spend": 13933.75,
      "purchases": 869,
      "addToCarts": 667,
      "clicks": 5091,
      "impressions": 373900
     },
     "d7": {
      "spend": 32280.850000000006,
      "purchases": 1970,
      "addToCarts": 1347,
      "clicks": 11754,
      "impressions": 826162
     },
     "d14": {
      "spend": 69803.65999999999,
      "purchases": 3217,
      "addToCarts": 2043,
      "clicks": 19998,
      "impressions": 1488217
     }
    }
   },
   {
    "id": "6997025320585",
    "name": "mobile:nm:socialmedia:feed-continuum-Prod-Ind:facebook.com_instagram.com:purchase.androidapp:continumm:IndCalzadoMarca2-new",
    "status": "active",
    "currentBudget": 600,
    "ageDays": 25,
    "audienceType": "unknown",
    "frequency7d": 1.21,
    "windows": {
     "d3": {
      "spend": 2196.69,
      "purchases": 116,
      "addToCarts": 44,
      "clicks": 409,
      "impressions": 37118
     },
     "d7": {
      "spend": 6451.08,
      "purchases": 296,
      "addToCarts": 162,
      "clicks": 1434,
      "impressions": 106148
     },
     "d14": {
      "spend": 16935.57,
      "purchases": 551,
      "addToCarts": 407,
      "clicks": 2680,
      "impressions": 239781
     }
    }
   },
   {
    "id": "6979862909585",
    "name": "mobile:nm:socialmedia:feed-continuum-General:facebook.com_instagram.com:purchase.androidapp:continumm:Catalogo1",
    "status": "active",
    "currentBudget": 3214.96,
    "ageDays": 30,
    "audienceType": "prospecting",
    "frequency7d": 1.36,
    "windows": {
     "d3": {
      "spend": 9718.79,
      "purchases": 590,
      "addToCarts": 369,
      "clicks": 3490,
      "impressions": 253201
     },
     "d7": {
      "spend": 22504.72,
      "purchases": 1344,
      "addToCarts": 851,
      "clicks": 8011,
      "impressions": 562935
     },
     "d14": {
      "spend": 48669.95999999999,
      "purchases": 2198,
      "addToCarts": 1430,
      "clicks": 13711,
      "impressions": 1042470
     }
    }
   },
   {
    "id": "6997025320385",
    "name": "mobile:nm:socialmedia:feed-continuum-Prod-Ind:facebook.com_instagram.com:purchase.androidapp:continumm:IndCalzadoMarca3-new",
    "status": "active",
    "currentBudget": 1400,
    "ageDays": 25,
    "audienceType": "unknown",
    "frequency7d": 1.28,
    "windows": {
     "d3": {
      "spend": 4059.0099999999998,
      "purchases": 202,
      "addToCarts": 79,
      "clicks": 734,
      "impressions": 89298
     },
     "d7": {
      "spend": 8762.34,
      "purchases": 458,
      "addToCarts": 281,
      "clicks": 1616,
      "impressions": 187600
     },
     "d14": {
      "spend": 15912.85,
      "purchases": 750,
      "addToCarts": 454,
      "clicks": 2582,
      "impressions": 298587
     }
    }
   },
   {
    "id": "6976728074985",
    "name": "mobile:nm:socialmedia:feed-continuum-General:facebook.com_instagram.com:purchase.androidapp:continumm:UGC-2-Regs",
    "status": "active",
    "currentBudget": 988.34,
    "ageDays": 30,
    "audienceType": "prospecting",
    "frequency7d": 1.11,
    "windows": {
     "d3": {
      "spend": 2851.49,
      "purchases": 329,
      "addToCarts": 101,
      "clicks": 722,
      "impressions": 90328
     },
     "d7": {
      "spend": 6918.320000000001,
      "purchases": 816,
      "addToCarts": 304,
      "clicks": 1878,
      "impressions": 222673
     },
     "d14": {
      "spend": 14703.340000000002,
      "purchases": 1597,
      "addToCarts": 628,
      "clicks": 3654,
      "impressions": 409786
     }
    }
   },
   {
    "id": "6972207304385",
    "name": "mobile:nm:socialmedia:feed-continuum-General:facebook.com_instagram.com:purchase.androidapp:continumm:UGC",
    "status": "active",
    "currentBudget": 1583.83,
    "ageDays": 30,
    "audienceType": "prospecting",
    "frequency7d": 1.13,
    "windows": {
     "d3": {
      "spend": 4759.27,
      "purchases": 322,
      "addToCarts": 247,
      "clicks": 949,
      "impressions": 82038
     },
     "d7": {
      "spend": 11086.81,
      "purchases": 837,
      "addToCarts": 454,
      "clicks": 2155,
      "impressions": 197156
     },
     "d14": {
      "spend": 24042.46,
      "purchases": 1583,
      "addToCarts": 842,
      "clicks": 3805,
      "impressions": 381898
     }
    }
   }
  ]
 },
 {
  "id": "pf-privalia-rmkt",
  "name": "Privalia · Retargeting · Purchases",
  "objective": "purchase",
  "currency": "MXN",
  "config": {
   "mode": "efficiency",
   "periodBudget": 240000,
   "dailyBudget": 8000,
   "velocityCap": 30,
   "cpaTarget": 180
  },
  "snapshots": [
   {
    "id": "r1",
    "name": "rmkt:cart-abandoners-7d",
    "status": "active",
    "currentBudget": 2200,
    "ageDays": 21,
    "audienceType": "remarketing",
    "frequency7d": 3.51,
    "windows": {
     "d3": {
      "spend": 7092,
      "purchases": 66,
      "addToCarts": 164,
      "clicks": 1773,
      "impressions": 31914
     },
     "d7": {
      "spend": 16548,
      "purchases": 153,
      "addToCarts": 383,
      "clicks": 4137,
      "impressions": 74466
     },
     "d14": {
      "spend": 33095,
      "purchases": 306,
      "addToCarts": 766,
      "clicks": 8274,
      "impressions": 148932
     }
    }
   },
   {
    "id": "r2",
    "name": "rmkt:viewers-30d",
    "status": "active",
    "currentBudget": 1600,
    "ageDays": 42,
    "audienceType": "remarketing",
    "frequency7d": 2.9,
    "windows": {
     "d3": {
      "spend": 4661,
      "purchases": 43,
      "addToCarts": 108,
      "clicks": 1165,
      "impressions": 20970
     },
     "d7": {
      "spend": 10875,
      "purchases": 101,
      "addToCarts": 252,
      "clicks": 2719,
      "impressions": 48942
     },
     "d14": {
      "spend": 21751,
      "purchases": 201,
      "addToCarts": 503,
      "clicks": 5438,
      "impressions": 97884
     }
    }
   },
   {
    "id": "r3",
    "name": "rmkt:past-buyers-LAL",
    "status": "active",
    "currentBudget": 1400,
    "ageDays": 41,
    "audienceType": "remarketing",
    "frequency7d": 3.89,
    "windows": {
     "d3": {
      "spend": 3865,
      "purchases": 21,
      "addToCarts": 54,
      "clicks": 966,
      "impressions": 17388
     },
     "d7": {
      "spend": 9018,
      "purchases": 50,
      "addToCarts": 125,
      "clicks": 2255,
      "impressions": 40590
     },
     "d14": {
      "spend": 18036,
      "purchases": 100,
      "addToCarts": 251,
      "clicks": 4509,
      "impressions": 81162
     }
    }
   },
   {
    "id": "r4",
    "name": "rmkt:category-browsers",
    "status": "active",
    "currentBudget": 1200,
    "ageDays": 39,
    "audienceType": "remarketing",
    "frequency7d": 2.28,
    "windows": {
     "d3": {
      "spend": 3335,
      "purchases": 12,
      "addToCarts": 31,
      "clicks": 834,
      "impressions": 15012
     },
     "d7": {
      "spend": 7781,
      "purchases": 29,
      "addToCarts": 72,
      "clicks": 1945,
      "impressions": 35010
     },
     "d14": {
      "spend": 15562,
      "purchases": 58,
      "addToCarts": 144,
      "clicks": 3890,
      "impressions": 70020
     }
    }
   },
   {
    "id": "r5",
    "name": "rmkt:broad-CDP-old",
    "status": "active",
    "currentBudget": 900,
    "ageDays": 49,
    "audienceType": "remarketing",
    "frequency7d": 2.41,
    "windows": {
     "d3": {
      "spend": 2888,
      "purchases": 5,
      "addToCarts": 13,
      "clicks": 722,
      "impressions": 12996
     },
     "d7": {
      "spend": 6739,
      "purchases": 12,
      "addToCarts": 31,
      "clicks": 1685,
      "impressions": 30330
     },
     "d14": {
      "spend": 13478,
      "purchases": 25,
      "addToCarts": 62,
      "clicks": 3370,
      "impressions": 60660
     }
    }
   },
   {
    "id": "r6",
    "name": "rmkt:wishlist-stale",
    "status": "active",
    "currentBudget": 700,
    "ageDays": 21,
    "audienceType": "remarketing",
    "frequency7d": 3.19,
    "windows": {
     "d3": {
      "spend": 2013,
      "purchases": 0,
      "addToCarts": 28,
      "clicks": 503,
      "impressions": 9054
     },
     "d7": {
      "spend": 4697,
      "purchases": 0,
      "addToCarts": 65,
      "clicks": 1174,
      "impressions": 21132
     },
     "d14": {
      "spend": 9393,
      "purchases": 0,
      "addToCarts": 130,
      "clicks": 2348,
      "impressions": 42264
     }
    }
   }
  ]
 },
 {
  "id": "pf-prospecting-leads",
  "name": "LATAM · Prospecting · Leads",
  "objective": "lead",
  "currency": "MXN",
  "config": {
   "mode": "scale",
   "periodBudget": 180000,
   "dailyBudget": 6000,
   "velocityCap": 30,
   "cpaTarget": 90
  },
  "snapshots": [
   {
    "id": "l1",
    "name": "pros:LAL-1pct-UGC",
    "status": "active",
    "currentBudget": 1500,
    "ageDays": 53,
    "audienceType": "prospecting",
    "frequency7d": 1.92,
    "windows": {
     "d3": {
      "spend": 4845,
      "purchases": 90,
      "addToCarts": 224,
      "clicks": 1211,
      "impressions": 21798
     },
     "d7": {
      "spend": 11305,
      "purchases": 209,
      "addToCarts": 523,
      "clicks": 2826,
      "impressions": 50868
     },
     "d14": {
      "spend": 22610,
      "purchases": 419,
      "addToCarts": 1047,
      "clicks": 5653,
      "impressions": 101754
     }
    }
   },
   {
    "id": "l2",
    "name": "pros:interest-tech",
    "status": "active",
    "currentBudget": 1200,
    "ageDays": 45,
    "audienceType": "prospecting",
    "frequency7d": 1.9,
    "windows": {
     "d3": {
      "spend": 3712,
      "purchases": 69,
      "addToCarts": 172,
      "clicks": 928,
      "impressions": 16704
     },
     "d7": {
      "spend": 8661,
      "purchases": 160,
      "addToCarts": 401,
      "clicks": 2165,
      "impressions": 38970
     },
     "d14": {
      "spend": 17321,
      "purchases": 321,
      "addToCarts": 802,
      "clicks": 4330,
      "impressions": 77940
     }
    }
   },
   {
    "id": "l3",
    "name": "pros:LAL-3pct",
    "status": "active",
    "currentBudget": 1000,
    "ageDays": 37,
    "audienceType": "prospecting",
    "frequency7d": 2.31,
    "windows": {
     "d3": {
      "spend": 2984,
      "purchases": 33,
      "addToCarts": 83,
      "clicks": 746,
      "impressions": 13428
     },
     "d7": {
      "spend": 6963,
      "purchases": 77,
      "addToCarts": 193,
      "clicks": 1741,
      "impressions": 31338
     },
     "d14": {
      "spend": 13926,
      "purchases": 155,
      "addToCarts": 387,
      "clicks": 3481,
      "impressions": 62658
     }
    }
   },
   {
    "id": "l4",
    "name": "pros:broad-AI",
    "status": "active",
    "currentBudget": 900,
    "ageDays": 53,
    "audienceType": "prospecting",
    "frequency7d": 3.42,
    "windows": {
     "d3": {
      "spend": 2468,
      "purchases": 27,
      "addToCarts": 69,
      "clicks": 617,
      "impressions": 11106
     },
     "d7": {
      "spend": 5759,
      "purchases": 64,
      "addToCarts": 160,
      "clicks": 1440,
      "impressions": 25920
     },
     "d14": {
      "spend": 11518,
      "purchases": 128,
      "addToCarts": 320,
      "clicks": 2880,
      "impressions": 51840
     }
    }
   },
   {
    "id": "l5",
    "name": "pros:interest-finance",
    "status": "active",
    "currentBudget": 700,
    "ageDays": 31,
    "audienceType": "prospecting",
    "frequency7d": 3.08,
    "windows": {
     "d3": {
      "spend": 1894,
      "purchases": 14,
      "addToCarts": 35,
      "clicks": 473,
      "impressions": 8514
     },
     "d7": {
      "spend": 4419,
      "purchases": 33,
      "addToCarts": 82,
      "clicks": 1105,
      "impressions": 19890
     },
     "d14": {
      "spend": 8838,
      "purchases": 65,
      "addToCarts": 164,
      "clicks": 2209,
      "impressions": 39762
     }
    }
   },
   {
    "id": "l6",
    "name": "pros:cold-nosignal",
    "status": "active",
    "currentBudget": 500,
    "ageDays": 34,
    "audienceType": "prospecting",
    "frequency7d": 2.2,
    "windows": {
     "d3": {
      "spend": 1604,
      "purchases": 0,
      "addToCarts": 0,
      "clicks": 401,
      "impressions": 7218
     },
     "d7": {
      "spend": 3742,
      "purchases": 0,
      "addToCarts": 0,
      "clicks": 936,
      "impressions": 16848
     },
     "d14": {
      "spend": 7485,
      "purchases": 0,
      "addToCarts": 0,
      "clicks": 1871,
      "impressions": 33678
     }
    }
   },
   {
    "id": "l7",
    "name": "pros:new-creative-test",
    "status": "grace",
    "currentBudget": 200,
    "ageDays": 4,
    "audienceType": "prospecting",
    "frequency7d": 1.87,
    "windows": {
     "d3": {
      "spend": 657,
      "purchases": 0,
      "addToCarts": 0,
      "clicks": 164,
      "impressions": 2952
     },
     "d7": {
      "spend": 1534,
      "purchases": 0,
      "addToCarts": 0,
      "clicks": 384,
      "impressions": 6912
     },
     "d14": {
      "spend": 3068,
      "purchases": 0,
      "addToCarts": 0,
      "clicks": 767,
      "impressions": 13806
     }
    }
   }
  ]
 }
];

// The demo dataset records each conversion in `purchases`. For non-purchase
// objectives, mirror that count into the objective's KPI field so the engine
// scores on the right signal. No-op for the purchase portfolio.
function withObjectiveKpi(pf: OptimizerPortfolio): OptimizerPortfolio {
  const kpiField = getObjectiveProfile(pf.objective).kpiField;
  if (kpiField === "purchases") return pf;
  const mirror = (w: WindowMetrics): WindowMetrics => ({
    ...w,
    [kpiField]: (w[kpiField] ?? w.purchases) as number,
  });
  return {
    ...pf,
    snapshots: pf.snapshots.map((s) => ({
      ...s,
      windows: { d3: mirror(s.windows.d3), d7: mirror(s.windows.d7), d14: mirror(s.windows.d14) },
    })),
  };
}

export const SAMPLE_PORTFOLIOS: OptimizerPortfolio[] = RAW_SAMPLE_PORTFOLIOS.map(withObjectiveKpi);

export const AD_SET_CATALOG: CatalogAdSet[] = [
 {
  "id": "6979863077585",
  "name": "mobile:nm:socialmedia:feed-continuum-General:facebook.com_instagram.com:purchase.androidapp:continumm:Catalogo2",
  "status": "active",
  "currentBudget": 4611.55,
  "ageDays": 30,
  "audienceType": "prospecting",
  "frequency7d": 0,
  "windows": {
   "d3": {
    "spend": 13933.75,
    "purchases": 869,
    "addToCarts": 667,
    "clicks": 5091,
    "impressions": 373900
   },
   "d7": {
    "spend": 32280.850000000006,
    "purchases": 1970,
    "addToCarts": 1347,
    "clicks": 11754,
    "impressions": 826162
   },
   "d14": {
    "spend": 69803.65999999999,
    "purchases": 3217,
    "addToCarts": 2043,
    "clicks": 19998,
    "impressions": 1488217
   }
  },
  "cpi": 22
 },
 {
  "id": "6979862909585",
  "name": "mobile:nm:socialmedia:feed-continuum-General:facebook.com_instagram.com:purchase.androidapp:continumm:Catalogo1",
  "status": "active",
  "currentBudget": 3214.96,
  "ageDays": 30,
  "audienceType": "prospecting",
  "frequency7d": 0,
  "windows": {
   "d3": {
    "spend": 9718.79,
    "purchases": 590,
    "addToCarts": 369,
    "clicks": 3490,
    "impressions": 253201
   },
   "d7": {
    "spend": 22504.72,
    "purchases": 1344,
    "addToCarts": 851,
    "clicks": 8011,
    "impressions": 562935
   },
   "d14": {
    "spend": 48669.95999999999,
    "purchases": 2198,
    "addToCarts": 1430,
    "clicks": 13711,
    "impressions": 1042470
   }
  },
  "cpi": 22
 },
 {
  "id": "6972207304385",
  "name": "mobile:nm:socialmedia:feed-continuum-General:facebook.com_instagram.com:purchase.androidapp:continumm:UGC",
  "status": "active",
  "currentBudget": 1583.83,
  "ageDays": 30,
  "audienceType": "prospecting",
  "frequency7d": 0,
  "windows": {
   "d3": {
    "spend": 4759.27,
    "purchases": 322,
    "addToCarts": 247,
    "clicks": 949,
    "impressions": 82038
   },
   "d7": {
    "spend": 11086.81,
    "purchases": 837,
    "addToCarts": 454,
    "clicks": 2155,
    "impressions": 197156
   },
   "d14": {
    "spend": 24042.46,
    "purchases": 1583,
    "addToCarts": 842,
    "clicks": 3805,
    "impressions": 381898
   }
  },
  "cpi": 15
 },
 {
  "id": "6997025324185",
  "name": "mobile:nm:socialmedia:feed-continuum-Prod-Ind:facebook.com_instagram.com:purchase.androidapp:continumm:IndCalzadoMarca4-new",
  "status": "active",
  "currentBudget": 1200,
  "ageDays": 25,
  "audienceType": "unknown",
  "frequency7d": 0,
  "windows": {
   "d3": {
    "spend": 3514.37,
    "purchases": 168,
    "addToCarts": 78,
    "clicks": 1034,
    "impressions": 77835
   },
   "d7": {
    "spend": 8400,
    "purchases": 411,
    "addToCarts": 193,
    "clicks": 2256,
    "impressions": 193363
   },
   "d14": {
    "spend": 17514.780000000002,
    "purchases": 739,
    "addToCarts": 462,
    "clicks": 3755,
    "impressions": 364066
   }
  },
  "cpi": 24
 },
 {
  "id": "6997025320585",
  "name": "mobile:nm:socialmedia:feed-continuum-Prod-Ind:facebook.com_instagram.com:purchase.androidapp:continumm:IndCalzadoMarca2-new",
  "status": "active",
  "currentBudget": 600,
  "ageDays": 25,
  "audienceType": "unknown",
  "frequency7d": 0,
  "windows": {
   "d3": {
    "spend": 2196.69,
    "purchases": 116,
    "addToCarts": 44,
    "clicks": 409,
    "impressions": 37118
   },
   "d7": {
    "spend": 6451.08,
    "purchases": 296,
    "addToCarts": 162,
    "clicks": 1434,
    "impressions": 106148
   },
   "d14": {
    "spend": 16935.57,
    "purchases": 551,
    "addToCarts": 407,
    "clicks": 2680,
    "impressions": 239781
   }
  },
  "cpi": 31
 },
 {
  "id": "6997025320385",
  "name": "mobile:nm:socialmedia:feed-continuum-Prod-Ind:facebook.com_instagram.com:purchase.androidapp:continumm:IndCalzadoMarca3-new",
  "status": "active",
  "currentBudget": 1400,
  "ageDays": 25,
  "audienceType": "unknown",
  "frequency7d": 0,
  "windows": {
   "d3": {
    "spend": 4059.0099999999998,
    "purchases": 202,
    "addToCarts": 79,
    "clicks": 734,
    "impressions": 89298
   },
   "d7": {
    "spend": 8762.34,
    "purchases": 458,
    "addToCarts": 281,
    "clicks": 1616,
    "impressions": 187600
   },
   "d14": {
    "spend": 15912.85,
    "purchases": 750,
    "addToCarts": 454,
    "clicks": 2582,
    "impressions": 298587
   }
  },
  "cpi": 21
 },
 {
  "id": "6976728074985",
  "name": "mobile:nm:socialmedia:feed-continuum-General:facebook.com_instagram.com:purchase.androidapp:continumm:UGC-2-Regs",
  "status": "active",
  "currentBudget": 988.34,
  "ageDays": 30,
  "audienceType": "prospecting",
  "frequency7d": 0,
  "windows": {
   "d3": {
    "spend": 2851.49,
    "purchases": 329,
    "addToCarts": 101,
    "clicks": 722,
    "impressions": 90328
   },
   "d7": {
    "spend": 6918.320000000001,
    "purchases": 816,
    "addToCarts": 304,
    "clicks": 1878,
    "impressions": 222673
   },
   "d14": {
    "spend": 14703.340000000002,
    "purchases": 1597,
    "addToCarts": 628,
    "clicks": 3654,
    "impressions": 409786
   }
  },
  "cpi": 9
 },
 {
  "id": "6997025154985",
  "name": "mobile:nm:socialmedia:feed-continuum-General:facebook.com_instagram.com:purchase.androidapp:continumm:UGC-new",
  "status": "active",
  "currentBudget": 806.46,
  "ageDays": 25,
  "audienceType": "prospecting",
  "frequency7d": 0,
  "windows": {
   "d3": {
    "spend": 2397.36,
    "purchases": 115,
    "addToCarts": 12,
    "clicks": 844,
    "impressions": 45294
   },
   "d7": {
    "spend": 5644.13,
    "purchases": 251,
    "addToCarts": 66,
    "clicks": 1715,
    "impressions": 100689
   },
   "d14": {
    "spend": 12167.32,
    "purchases": 444,
    "addToCarts": 147,
    "clicks": 3403,
    "impressions": 190614
   }
  },
  "cpi": 27
 },
 {
  "id": "6985511642585",
  "name": "mobile:nm:socialmedia:feed-continuum-CDP:facebook.com_instagram.com:purchase.androidapp:continumm:Perfumes3",
  "status": "frozen",
  "currentBudget": 500,
  "ageDays": 30,
  "audienceType": "remarketing",
  "frequency7d": 0,
  "windows": {
   "d3": {
    "spend": 0,
    "purchases": 4,
    "addToCarts": 1,
    "clicks": 0,
    "impressions": 0
   },
   "d7": {
    "spend": 1704.96,
    "purchases": 185,
    "addToCarts": 7,
    "clicks": 1345,
    "impressions": 33107
   },
   "d14": {
    "spend": 7101.959999999998,
    "purchases": 504,
    "addToCarts": 119,
    "clicks": 3605,
    "impressions": 137333
   }
  },
  "cpi": 14
 },
 {
  "id": "6997025259785",
  "name": "mobile:nm:socialmedia:feed-continuum-CDP:facebook.com_instagram.com:purchase.androidapp:continumm:Calzado1-new",
  "status": "active",
  "currentBudget": 982.44,
  "ageDays": 25,
  "audienceType": "remarketing",
  "frequency7d": 0,
  "windows": {
   "d3": {
    "spend": 2476.3999999999996,
    "purchases": 51,
    "addToCarts": 14,
    "clicks": 1434,
    "impressions": 45346
   },
   "d7": {
    "spend": 4061.8900000000003,
    "purchases": 102,
    "addToCarts": 58,
    "clicks": 1938,
    "impressions": 71613
   },
   "d14": {
    "spend": 7026.759999999999,
    "purchases": 153,
    "addToCarts": 95,
    "clicks": 2741,
    "impressions": 107561
   }
  },
  "cpi": 46
 },
 {
  "id": "6985623473385",
  "name": "mobile:nm:socialmedia:feed-continuum-Prod-Ind:facebook.com_instagram.com:purchase.androidapp:continumm:IndCalzadoMarca4",
  "status": "frozen",
  "currentBudget": 918.78,
  "ageDays": 30,
  "audienceType": "unknown",
  "frequency7d": 0,
  "windows": {
   "d3": {
    "spend": 0,
    "purchases": 0,
    "addToCarts": 0,
    "clicks": 0,
    "impressions": 0
   },
   "d7": {
    "spend": 0,
    "purchases": 0,
    "addToCarts": 0,
    "clicks": 0,
    "impressions": 0
   },
   "d14": {
    "spend": 2766.32,
    "purchases": 56,
    "addToCarts": 59,
    "clicks": 307,
    "impressions": 38509
   }
  },
  "cpi": 49
 },
 {
  "id": "6946766137585",
  "name": "mobile:nm:socialmedia:feed-continuum-Prod-Ind:facebook.com_instagram.com:purchase.androidapp:continumm:XS-S-M",
  "status": "frozen",
  "currentBudget": 346.1,
  "ageDays": 30,
  "audienceType": "unknown",
  "frequency7d": 0,
  "windows": {
   "d3": {
    "spend": 0,
    "purchases": 0,
    "addToCarts": 0,
    "clicks": 0,
    "impressions": 0
   },
   "d7": {
    "spend": 0,
    "purchases": 1,
    "addToCarts": 0,
    "clicks": 0,
    "impressions": 0
   },
   "d14": {
    "spend": 1174.96,
    "purchases": 31,
    "addToCarts": 36,
    "clicks": 742,
    "impressions": 11307
   }
  },
  "cpi": 38
 },
 {
  "id": "6997025323785",
  "name": "mobile:nm:socialmedia:feed-continuum-Prod-Ind:facebook.com_instagram.com:purchase.androidapp:continumm:XS-S-M5Registros-new",
  "status": "frozen",
  "currentBudget": 332.56,
  "ageDays": 25,
  "audienceType": "unknown",
  "frequency7d": 0,
  "windows": {
   "d3": {
    "spend": 0,
    "purchases": 0,
    "addToCarts": 0,
    "clicks": 0,
    "impressions": 0
   },
   "d7": {
    "spend": 0,
    "purchases": 0,
    "addToCarts": 0,
    "clicks": 0,
    "impressions": 0
   },
   "d14": {
    "spend": 1147.3899999999999,
    "purchases": 41,
    "addToCarts": 6,
    "clicks": 303,
    "impressions": 18223
   }
  },
  "cpi": 28
 },
 {
  "id": "6997025260385",
  "name": "mobile:nm:socialmedia:feed-continuum-CDP:facebook.com_instagram.com:purchase.androidapp:continumm:Accesorios1-new",
  "status": "frozen",
  "currentBudget": 332.56,
  "ageDays": 25,
  "audienceType": "remarketing",
  "frequency7d": 0,
  "windows": {
   "d3": {
    "spend": 0,
    "purchases": 0,
    "addToCarts": 0,
    "clicks": 0,
    "impressions": 0
   },
   "d7": {
    "spend": 0,
    "purchases": 0,
    "addToCarts": 0,
    "clicks": 0,
    "impressions": 0
   },
   "d14": {
    "spend": 1038.19,
    "purchases": 14,
    "addToCarts": 0,
    "clicks": 207,
    "impressions": 10318
   }
  },
  "cpi": 74
 },
 {
  "id": "6946767125985",
  "name": "mobile:nm:socialmedia:feed-continuum-Prod-Ind:facebook.com_instagram.com:purchase.androidapp:continumm:XS-S-M3",
  "status": "frozen",
  "currentBudget": 229.46,
  "ageDays": 30,
  "audienceType": "unknown",
  "frequency7d": 0,
  "windows": {
   "d3": {
    "spend": 0,
    "purchases": 0,
    "addToCarts": 0,
    "clicks": 0,
    "impressions": 0
   },
   "d7": {
    "spend": 0,
    "purchases": 0,
    "addToCarts": 0,
    "clicks": 0,
    "impressions": 0
   },
   "d14": {
    "spend": 837.0799999999999,
    "purchases": 18,
    "addToCarts": 33,
    "clicks": 584,
    "impressions": 6925
   }
  },
  "cpi": 47
 },
 {
  "id": "6962229975185",
  "name": "mobile:nm:socialmedia:feed-continuum-Prod-Ind:facebook.com_instagram.com:purchase.androidapp:continumm:XS-S-M5Registros",
  "status": "frozen",
  "currentBudget": 135.79,
  "ageDays": 30,
  "audienceType": "unknown",
  "frequency7d": 0,
  "windows": {
   "d3": {
    "spend": 0,
    "purchases": 0,
    "addToCarts": 0,
    "clicks": 0,
    "impressions": 0
   },
   "d7": {
    "spend": 0,
    "purchases": 0,
    "addToCarts": 0,
    "clicks": 0,
    "impressions": 0
   },
   "d14": {
    "spend": 431.36,
    "purchases": 13,
    "addToCarts": 5,
    "clicks": 269,
    "impressions": 9287
   }
  },
  "cpi": 33
 }
];
