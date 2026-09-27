import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';
import { ALL_COUNTRY_CALLING_CODES, CountryCallingCode } from '../../data/countryCallingCodes';

interface Props {
  value: string; // e.g. "+233"
  onChange: (dialCode: string, countryName?: string) => void;
  id?: string;
  selectedCountryName?: string;
}

export const CountryCallingCodeSelector: React.FC<Props> = ({
  value,
  onChange,
  id = 'country-code-selector',
  selectedCountryName,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const selectedItem =
    (selectedCountryName
      ? ALL_COUNTRY_CALLING_CODES.find(
          (c) => c.name.toLowerCase() === selectedCountryName.toLowerCase()
        )
      : undefined) ||
    ALL_COUNTRY_CALLING_CODES.find((c) => c.dialCode === value) ||
    ALL_COUNTRY_CALLING_CODES[0];

  const filteredCodes = ALL_COUNTRY_CALLING_CODES.filter((c) => {
    const term = searchTerm.toLowerCase();
    return (
      c.name.toLowerCase().includes(term) ||
      c.dialCode.includes(term) ||
      c.code.toLowerCase().includes(term)
    );
  });

  const handleSelect = (c: CountryCallingCode) => {
    onChange(c.dialCode, c.name);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div className="relative" ref={dropdownRef} id={id}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="h-10 px-2.5 py-1.5 bg-slate-950/90 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl text-xs text-white flex items-center justify-between gap-1.5 min-w-[105px] transition-all cursor-pointer"
        title="Select country calling code"
      >
        <span className="text-base leading-none">{selectedItem.flag}</span>
        <span className="font-mono font-bold text-emerald-400 text-xs">{selectedItem.dialCode}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 w-72 max-h-72 bg-[#091120] border border-slate-700/80 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {/* Search Box */}
          <div className="p-2 border-b border-slate-800 bg-slate-950/80">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                autoFocus
                placeholder="Search country or code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40 p-1">
            {filteredCodes.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-500">No country found</div>
            ) : (
              filteredCodes.map((c) => {
                const isSelected = c.code === selectedItem.code && c.dialCode === value;
                return (
                  <button
                    key={`${c.code}-${c.dialCode}`}
                    type="button"
                    onClick={() => handleSelect(c)}
                    className={`w-full px-2.5 py-1.5 flex items-center justify-between text-left rounded-lg text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                        : 'hover:bg-slate-800/80 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate pr-2">
                      <span className="text-base shrink-0">{c.flag}</span>
                      <span className="truncate">{c.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-mono text-[11px] text-emerald-400">{c.dialCode}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
