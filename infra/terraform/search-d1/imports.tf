# Optional adoption of databases created outside Terraform (see variables.tf). With both
# variables null (the default) these blocks import nothing.

import {
  for_each = var.import_search_database_id == null ? toset([]) : toset([var.import_search_database_id])
  to       = cloudflare_d1_database.search
  id       = "${var.account_id}/${each.value}"
}

import {
  for_each = var.import_search_preview_database_id == null ? toset([]) : toset([var.import_search_preview_database_id])
  to       = cloudflare_d1_database.search_preview
  id       = "${var.account_id}/${each.value}"
}
