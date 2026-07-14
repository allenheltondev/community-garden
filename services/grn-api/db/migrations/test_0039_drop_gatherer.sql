-- Test script for 0039_drop_gatherer.sql migration

do $$
begin
    -- The gatherer_profiles table must be gone.
    if exists (
        select 1 from information_schema.tables
        where table_name = 'gatherer_profiles'
    ) then
        raise exception 'gatherer_profiles table should have been dropped';
    end if;

    -- user_type must no longer accept 'gatherer'.
    begin
        insert into users (id, email, user_type)
        values (gen_random_uuid(), 'gatherer-check@example.com', 'gatherer');
        raise exception 'user_type check should reject the gatherer value';
    exception
        when check_violation then
            null; -- expected
    end;

    -- 'grower' must still be accepted.
    insert into users (id, email, user_type)
    values (gen_random_uuid(), 'grower-check@example.com', 'grower');

    -- Clean up the probe row.
    delete from users where email = 'grower-check@example.com';
end $$;
