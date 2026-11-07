import test from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateIp } from '../../components/profile/private-ip.ts';

test('loopback and private addresses are hidden', () => {
  for (const ip of ['::1', '127.0.0.1', '::ffff:127.0.0.1', '10.2.3.4', '192.168.1.5', '172.20.0.1', 'fe80::1', '', null]) {
    assert.equal(isPrivateIp(ip), true, String(ip));
  }
});

test('public addresses are shown', () => {
  for (const ip of ['39.32.10.4', '172.32.0.1', '2400:adc1:1::1']) assert.equal(isPrivateIp(ip), false, ip);
});
