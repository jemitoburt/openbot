import { defineMessages } from "../../../message";

export const messages = defineMessages("error.dashboard", {
  "error.dashboard.unsupported": "This host does not support Dashboards. Update the host to use it.",
  "error.dashboard.unavailable": "Install Dashboards on this host first.",
  "error.dashboard.forbidden": "You do not have access to this dashboard action.",
  "error.dashboard.notFound": "The dashboard or item is unavailable.",
  "error.dashboard.conflict": "This dashboard changed. Reload it and try again.",
  "error.dashboard.invalid": "The dashboard data is invalid.",
  "error.dashboard.storage": "OpenBot could not read or save this dashboard.",
  "error.dashboard.limit": "This host has reached the dashboard limit.",
});
