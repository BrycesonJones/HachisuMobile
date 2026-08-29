import { assertEquals } from 'jsr:@std/assert@1.0.19';

import { collectBtcpayStoreIds } from './account-deletion.ts';

Deno.test('collects distinct store ids from rows and profile', () => {
  const ids = collectBtcpayStoreIds(
    [
      { btcpay_store_id: 'store-a' },
      { btcpay_store_id: 'store-b' },
      { btcpay_store_id: 'store-a' },
    ],
    'store-c',
  );
  assertEquals(ids, ['store-a', 'store-b', 'store-c']);
});

Deno.test('profile id already covered by a row is not duplicated', () => {
  const ids = collectBtcpayStoreIds([{ btcpay_store_id: 'store-a' }], 'store-a');
  assertEquals(ids, ['store-a']);
});

Deno.test('drops null, blank, and whitespace ids', () => {
  const ids = collectBtcpayStoreIds(
    [{ btcpay_store_id: null }, { btcpay_store_id: '  ' }, { btcpay_store_id: ' store-a ' }],
    '',
  );
  assertEquals(ids, ['store-a']);
});

Deno.test('no stores yields an empty list', () => {
  assertEquals(collectBtcpayStoreIds([], null), []);
  assertEquals(collectBtcpayStoreIds([], undefined), []);
});
