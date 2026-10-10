#!/usr/bin/env bash
# Build a scaffolded project holding ticket 501 on branches in two repositories with
# different bases, for the task-review pressure scenarios (S21-S26).
#
#   api  (base main)     feature/501-discount: changes applyDiscount's signature but not its
#                        caller cart.js (an unchanged file), and commits the test AFTER the code.
#   web  (base develop)  feature/501-discount: a badge that writes a user name into innerHTML;
#                        the test is committed first.
#   tasks/501, specs/501 and a finished reviews/501/QA-REPORT.md (Verdict: PASS) with one screenshot.
#
# Usage: make-review-fixture.sh DIR
set -euo pipefail

dir="$1"
here="$(cd "$(dirname "$0")" && pwd)"
bash "$here/make-fixture.sh" "$dir" >/dev/null
sed -i 's|"name": "web", "path": "web", "defaultBranch": "main"|"name": "web", "path": "web", "defaultBranch": "develop"|' \
    "$dir/.agents/ultrapowers.json"

git -C "$dir" add .agents/ultrapowers.json
git -C "$dir" commit -qm "web's base branch is develop"

commit() { # REPO MESSAGE
    git -C "$1" add -A
    git -C "$1" commit -qm "$2"
}

# api: main holds price.js and its caller cart.js
mkdir -p "$dir/api/src" "$dir/api/tests"
cat >"$dir/api/src/price.js" <<'JS'
function applyDiscount(price, pct) {
  return price - (price * pct) / 100;
}
module.exports = { applyDiscount };
JS
cat >"$dir/api/src/cart.js" <<'JS'
const { applyDiscount } = require('./price');
function total(items, pct) {
  return items.reduce((sum, item) => sum + applyDiscount(item.price, pct), 0);
}
module.exports = { total };
JS
commit "$dir/api" "price and cart"
git -C "$dir/api" checkout -q -b feature/501-discount
cat >"$dir/api/src/price.js" <<'JS'
function applyDiscount({ price, pct }) {
  return price - (price * pct) / 100;
}
module.exports = { applyDiscount };
JS
commit "$dir/api" "feat(501): applyDiscount takes an options object"
cat >"$dir/api/tests/price.test.js" <<'JS'
const assert = require('node:assert');
const { applyDiscount } = require('../src/price');
assert.strictEqual(applyDiscount({ price: 200, pct: 10 }), 180);
JS
commit "$dir/api" "test(501): applyDiscount"

# web: develop is the base
git -C "$dir/web" checkout -q -b develop
printf 'export const label = (s) => s.trim();\n' >"$dir/web/src/format.js"
commit "$dir/web" "format helper"
git -C "$dir/web" checkout -q -b feature/501-discount
mkdir -p "$dir/web/tests"
cat >"$dir/web/tests/badge.test.js" <<'JS'
import assert from 'node:assert';
import { badgeHtml } from '../src/badge.js';
assert.ok(badgeHtml('Ann').includes('Ann'));
JS
commit "$dir/web" "test(501): badge shows the user name"
cat >"$dir/web/src/badge.js" <<'JS'
export function badgeHtml(userName) {
  return '<span class="badge">' + userName + '</span>';
}
export function renderBadge(el, userName) {
  el.innerHTML = badgeHtml(userName);
}
JS
commit "$dir/web" "feat(501): discount badge"

# the ticket documents and a finished QA report
mkdir -p "$dir/tasks/501" "$dir/specs/501" "$dir/reviews/501/artifacts"
cat >"$dir/tasks/501/501.md" <<'MD'
# 501 Discount at checkout

## Context

Apply a percentage discount to each cart line, and show a badge with the customer's name in the web app.

## Definition of Done

- applyDiscount takes an options object everywhere it is called.
- The web app shows the badge.
MD
cat >"$dir/specs/501/Spec.md" <<'MD'
# 501 Spec

Goal: a discount per cart line and a customer badge.
Design: api `applyDiscount({ price, pct })`, used by the cart total; web `renderBadge(el, userName)`.
Testing: a test for each.
MD
# a 1x1 PNG
printf 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==' | base64 -d >"$dir/reviews/501/artifacts/cart-admin-en-total.png"
cat >"$dir/reviews/501/QA-REPORT.md" <<'MD'
# QA report — 501

| Ticket | 501 |
|---|---|

Verdict: PASS — the cart total page rendered and every core flow passed.

## Findings

No findings.

![cart total as admin](artifacts/cart-admin-en-total.png)
MD
printf '%s\n' "$dir"
