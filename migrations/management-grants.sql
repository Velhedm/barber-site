-- Run only after 001 management migration and a restore rehearsal, using database owner.
-- Never grant access to other brands or PUBLIC. The runtime cannot edit/delete the audit log.
BEGIN;
REVOKE ALL ON ilker_management_versions,ilker_rooms,ilker_masters,ilker_catalog,
 ilker_catalog_options,ilker_master_services,ilker_master_days,ilker_time_blocks,
 ilker_booking_assignment,ilker_booking_archive,ilker_audit FROM PUBLIC;
GRANT SELECT ON ilker_management_versions TO ilker_service;
GRANT SELECT,INSERT,UPDATE,DELETE ON ilker_rooms,ilker_masters,ilker_catalog,
 ilker_catalog_options,ilker_master_services,ilker_master_days,ilker_time_blocks,
 ilker_booking_assignment,ilker_booking_archive TO ilker_service;
GRANT SELECT,INSERT ON ilker_audit TO ilker_service;
REVOKE UPDATE,DELETE,TRUNCATE ON ilker_audit FROM ilker_service;
REVOKE ALL ON ilker_clients,ilker_visit_state,ilker_operations,ilker_finance_entries,ilker_finance_items FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON ilker_clients,ilker_visit_state TO ilker_service;
GRANT SELECT,INSERT ON ilker_operations,ilker_finance_entries,ilker_finance_items TO ilker_service;
REVOKE UPDATE,DELETE,TRUNCATE ON ilker_operations,ilker_finance_entries,ilker_finance_items FROM ilker_service;
REVOKE ALL ON ilker_users,ilker_account_sessions,ilker_login_attempts,ilker_push_owners FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON ilker_users TO ilker_service;
REVOKE DELETE,TRUNCATE ON ilker_users FROM ilker_service;
GRANT SELECT,INSERT,UPDATE,DELETE ON ilker_account_sessions,ilker_login_attempts,ilker_push_owners TO ilker_service;
REVOKE ALL ON ilker_push_leases FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON ilker_push_leases TO ilker_service;
REVOKE ALL ON ilker_push_changes,ilker_push_change_deliveries FROM PUBLIC;
GRANT SELECT,INSERT ON ilker_push_changes TO ilker_service;
GRANT SELECT,INSERT,UPDATE ON ilker_push_change_deliveries TO ilker_service;
REVOKE ALL ON ilker_recovery_addresses,ilker_recovery_requests FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON ilker_recovery_addresses,ilker_recovery_requests TO ilker_service;
REVOKE ALL ON ilker_reminder_settings,ilker_reminder_consent,ilker_reminder_jobs FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON ilker_reminder_settings,ilker_reminder_consent,ilker_reminder_jobs TO ilker_service;
REVOKE ALL ON ilker_business_settings FROM PUBLIC;
GRANT SELECT,UPDATE ON ilker_business_settings TO ilker_service;
REVOKE ALL ON ilker_system_alerts,ilker_system_alert_deliveries FROM PUBLIC;
GRANT SELECT,INSERT ON ilker_system_alerts TO ilker_service;
GRANT SELECT,INSERT,UPDATE ON ilker_system_alert_deliveries TO ilker_service;
REVOKE ALL ON ilker_booking_policy FROM PUBLIC;
GRANT SELECT,INSERT ON ilker_booking_policy TO ilker_service;
COMMIT;
