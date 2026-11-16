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
COMMIT;
