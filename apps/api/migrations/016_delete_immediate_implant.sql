-- "Anında implant" katalog kayıtları tamamen silinir (geçmiş teklifler kendi snapshot'ında saklı)
delete from treatment_types where code = 'implant_imm';
