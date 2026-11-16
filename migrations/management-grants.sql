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
COMMIT;
