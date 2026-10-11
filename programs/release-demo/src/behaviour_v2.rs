use pinocchio::{
    AccountView,
    Address,
    ProgramResult,
    syscalls::{sol_log_, sol_set_return_data},
};

pub fn execute(
    _program_id: &Address,
    _accounts: &mut [AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    const LOG_MSG: &str = "Program release-demo version 2 running: quadratic transform";
    unsafe {
        sol_log_(LOG_MSG.as_ptr(), LOG_MSG.len() as u64);
    }

    let mut acc: u64 = 202;
    for &b in instruction_data {
        acc = acc.wrapping_mul(31).wrapping_add(b as u64);
    }

    let mut return_bytes = [0u8; 12];
    return_bytes[0..3].copy_from_slice(b"V2:");
    return_bytes[3] = b'=';
    return_bytes[4..12].copy_from_slice(&acc.to_le_bytes());

    unsafe {
        sol_set_return_data(return_bytes.as_ptr(), return_bytes.len() as u64);
    }

    const EXIT_MSG: &str = "Program release-demo version 2 execution complete";
    unsafe {
        sol_log_(EXIT_MSG.as_ptr(), EXIT_MSG.len() as u64);
    }

    Ok(())
}
