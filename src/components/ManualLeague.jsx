import {createContext,useContext} from 'react';

export const ManualLeague=createContext('cbb');
export const useLeague=()=>useContext(ManualLeague);
