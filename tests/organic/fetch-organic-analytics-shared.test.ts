import assert from "node:assert/strict";
import test from "node:test";

import { lastTwoMetricValuesUntil, parseInsightsSeries } from "../../supabase/functions/fetch-organic-analytics/lib/shared";

test("parseInsightsSeries sums breakdown values when point payload is breakdown-shaped", () => {
  const payload = {
    data: [
      {
        name: "follower_count",
        values: [
          {
            end_time: "2026-02-24T07:00:00+0000",
            value: {
              breakdowns: [
                {
                  results: [{ value: 2 }, { value: 3 }],
                },
              ],
            },
          },
          {
            end_time: "2026-02-25T07:00:00+0000",
            value: {
              breakdowns: [
                {
                  results: [{ value: 1 }, { value: 4 }],
                },
              ],
            },
          },
        ],
      },
    ],
  } as unknown as Record<string, unknown>;

  const series = parseInsightsSeries(payload, "follower_count");
  assert.deepEqual(series, [
    { date: "2026-02-24", value: 5 },
    { date: "2026-02-25", value: 5 },
  ]);
});

test("lastTwoMetricValuesUntil supports breakdown-shaped metric values", () => {
  const metric = {
    name: "profile_views",
    values: [
      {
        end_time: "2026-02-23T07:00:00+0000",
        value: {
          breakdowns: [
            {
              results: [{ value: 4 }, { value: 1 }],
            },
          ],
        },
      },
      {
        end_time: "2026-02-24T07:00:00+0000",
        value: {
          breakdowns: [
            {
              results: [{ value: 5 }, { value: 2 }],
            },
          ],
        },
      },
    ],
  } as unknown as Record<string, unknown>;

  const pair = lastTwoMetricValuesUntil(metric, "2026-02-24");
  assert.deepEqual(pair, { current: 7, previous: 5 });
});
