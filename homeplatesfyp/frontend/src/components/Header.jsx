import React from 'react'
export default function Header (){
    return(
        <header className="p-[15px] shadow-xl">
           <div className="max-w[120px] mx-auto border border-red-500">
            <div className="w-[100px]">
                <img src="images/logo.png" className="w-full" alt="" />
            </div>
            hello border
           </div>
        </header>
    )
}