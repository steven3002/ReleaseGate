#![no_std]

use pinocchio::{
    entrypoint,
    nostd_panic_handler,
    AccountView,
    Address,
    ProgramResult,
};

nostd_panic_handler!();

#[cfg(all(feature = "v1", feature = "v2"))]
compile_error!("Features 'v1' and 'v2' are mutually exclusive. Specify exactly one.");

#[cfg(not(any(feature = "v1", feature = "v2")))]
compile_error!("Either feature 'v1' or 'v2' must be enabled.");

#[cfg(feature = "v1")]
mod behaviour_v1;

#[cfg(feature = "v2")]
mod behaviour_v2;

entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Address,
    accounts: &mut [AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    #[cfg(feature = "v1")]
    {
        behaviour_v1::execute(program_id, accounts, instruction_data)
    }

    #[cfg(feature = "v2")]
    {
        behaviour_v2::execute(program_id, accounts, instruction_data)
    }
}
