import { describe, expect, it } from "vitest";
import { analyzeCNIS, parseCnisText } from "@/lib/cnis";

describe("cnis analyzer", () => {
  it("parses simple CNIS text and indicates right when grace and carencia are met", () => {
    const vinculos = parseCnisText(`
      EMPRESA ALFA LTDA
      Empregado
      01/01/2020
      31/12/2023
    `);

    const analysis = analyzeCNIS(vinculos, "2024-03-10", { todayDate: "2024-03-10" });

    expect(vinculos).toHaveLength(1);
    expect(analysis.carenciaOk).toBe(true);
    expect(analysis.mantemQualidade).toBe(true);
    expect(analysis.direito).toBe(true);
  });

  it("waives carencia for prison dates before 2019-06-18", () => {
    const vinculos = parseCnisText(`
      EMPRESA BETA LTDA; Empregado; 01/01/2018; 31/03/2018
    `);

    const analysis = analyzeCNIS(vinculos, "2018-05-01", { todayDate: "2018-05-01" });

    expect(analysis.carenciaExigida).toBe(false);
    expect(analysis.carenciaOk).toBe(true);
    expect(analysis.direito).toBe(true);
  });

  it("does not indicate right after quality loss before prison", () => {
    const vinculos = parseCnisText(`
      EMPRESA GAMA LTDA; Empregado; 01/01/2020; 31/12/2020
    `);

    const analysis = analyzeCNIS(vinculos, "2023-08-01", { todayDate: "2023-08-01" });

    expect(analysis.mantemQualidade).toBe(false);
    expect(analysis.direito).toBe(false);
  });

  it("parses CNIS-like copied rows with headers, tabs and short dates", () => {
    const vinculos = parseCnisText(`
      Seq. NIT Origem do Vinculo Tipo Data Inicio Data Fim Ult. Remun. Indicadores
      1 123.45678.90-1 EMPRESA DELTA LTDA Empregado 01/01/20 31/12/21 12/2021
      2 123.45678.90-1 CONTRIBUINTE INDIVIDUAL\tContribuinte Individual\t01/02/2022\tEm aberto
      Acoes
    `);

    expect(vinculos).toHaveLength(2);
    expect(vinculos[0]).toMatchObject({
      nome: "123.45678.90-1 EMPRESA DELTA LTDA",
      tipo: "Empregado",
      inicio: "01/01/2020",
      fim: "31/12/2021",
    });
    expect(vinculos[1]).toMatchObject({
      nome: "123.45678.90-1 Contribuinte Individual",
      tipo: "Contribuinte Individual",
      inicio: "01/02/2022",
      fim: "Em aberto",
      emAberto: true,
    });
  });
});

