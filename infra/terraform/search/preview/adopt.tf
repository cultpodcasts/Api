# One-time adoption (SP-1.11, cultpodcasts/Api#273). Done by CI; no manual `terraform import`.
# The preview database 83ae1e81-bf07-4be8-aabf-2d4138959f74 was created by the #270 apply in
# the production workspace; that workspace now forgets it (../production/state-migration.tf,
# destroy = false) and this new workspace imports it, so it is never destroyed or recreated.
#
# An import block is a no-op once the database is in this state. It FAILS if the database no
# longer exists, so remove this file in the follow-up once the first preview apply has run
# (tracked on cultpodcasts/Api#273); after that, a torn-down preview stack is rebuilt by CI.

import {
  to = module.search.cloudflare_d1_database.this
  id = "${var.cloudflare_account_id}/83ae1e81-bf07-4be8-aabf-2d4138959f74"
}
