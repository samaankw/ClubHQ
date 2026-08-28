-- 0023's create-or-replace added p_series_id as a new trailing parameter,
-- but Postgres treats a different arity as a distinct overload rather than
-- a true replacement — left the original 8-arg version (with no series_id
-- support) still callable. Drop it so there's exactly one version.
drop function if exists create_targeted_event(uuid, text, text, text, timestamptz, text, uuid, uuid[]);
