import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { COUNTRIES, type Country, findCountryByDialPrefix, flagEmoji } from '@/lib/countries';

/**
 * Bandeira do país.
 *
 * Emoji de bandeira não renderiza no Chrome/Edge do Windows (vira o par de
 * letras), então a imagem vem primeiro e o emoji é só a rede de proteção de
 * quando ela não carrega. A CSP do index.html já libera `img-src https://*`;
 * se um dia ela for apertada, este host precisa entrar na lista.
 */
function CountryFlag({ country, className }: { country: Country; className?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className={cn('text-base leading-none', className)} aria-hidden="true">
        {flagEmoji(country.iso2)}
      </span>
    );
  }

  return (
    <img
      src={`https://flagcdn.com/w40/${country.iso2}.png`}
      alt=""
      aria-hidden="true"
      loading="lazy"
      width={20}
      height={15}
      onError={() => setFailed(true)}
      className={cn('h-[15px] w-5 shrink-0 rounded-[2px] object-cover', className)}
    />
  );
}

interface PhoneNumberInputProps {
  country: Country;
  onCountryChange: (country: Country) => void;
  /** Número NACIONAL (sem o código do país), como o usuário digitou. */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  onEnter?: () => void;
}

/**
 * Telefone com seletor de país. O estado é o número nacional; quem chama monta
 * o E.164 com `toE164(country, value)`.
 *
 * Colar o número completo funciona: começando com "+" ou "00", o país é
 * reconhecido pelo prefixo e o resto vai para o campo -- ninguém precisa
 * separar à mão o que copiou do WhatsApp.
 */
export function PhoneNumberInput({
  country,
  onCountryChange,
  value,
  onChange,
  id,
  placeholder,
  disabled,
  className,
  onEnter,
}: PhoneNumberInputProps) {
  const [open, setOpen] = useState(false);

  const handleChange = (raw: string) => {
    const trimmed = raw.trim();
    const international = trimmed.startsWith('+')
      ? trimmed.slice(1).replace(/\D/g, '')
      : /^00\d/.test(trimmed.replace(/[\s()-]/g, ''))
        ? trimmed.replace(/\D/g, '').slice(2)
        : null;

    if (international) {
      const detected = findCountryByDialPrefix(international);
      if (detected) {
        onCountryChange(detected);
        onChange(international.slice(detected.dialCode.length));
        return;
      }
    }

    onChange(raw.replace(/[^\d\s()-]/g, ''));
  };

  // cmdk casa pelo `value` do item: nome + código + ISO, para achar tanto por
  // "Estados Unidos" quanto por "+1" ou "us".
  const items = useMemo(
    () => COUNTRIES.map((c) => ({ country: c, search: `${c.name} +${c.dialCode} ${c.iso2}` })),
    [],
  );

  return (
    <div className={cn('flex items-stretch gap-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={`País: ${country.name} (+${country.dialCode})`}
            disabled={disabled}
            className="w-[104px] shrink-0 justify-between gap-1 px-2 font-normal"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <CountryFlag country={country} />
              <span className="truncate text-sm">+{country.dialCode}</span>
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar país ou código..." />
            <CommandList>
              <CommandEmpty>Nenhum país encontrado.</CommandEmpty>
              <CommandGroup>
                {items.map(({ country: option, search }) => (
                  <CommandItem
                    key={`${option.iso2}-${option.dialCode}`}
                    value={search}
                    onSelect={() => {
                      onCountryChange(option);
                      setOpen(false);
                    }}
                    className="gap-2"
                  >
                    <CountryFlag country={option} />
                    <span className="flex-1 truncate">{option.name}</span>
                    <span className="text-xs text-muted-foreground">+{option.dialCode}</span>
                    <Check
                      className={cn(
                        'h-4 w-4',
                        option.iso2 === country.iso2 ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
        className="flex-1"
      />
    </div>
  );
}
