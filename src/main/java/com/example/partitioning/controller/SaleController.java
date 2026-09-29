package com.example.partitioning.controller;

import com.example.partitioning.entity.Sale;
import com.example.partitioning.service.SaleService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("api/v1/sales")
public class SaleController {
    private final SaleService saleService;

    public SaleController(SaleService saleService) {
        this.saleService = saleService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Sale create(@RequestBody Sale sale) {
        return saleService.create(sale);
    }

    @GetMapping
    public List<Sale> list() {
        return saleService.findAll();
    }

    @PutMapping("/{id}")
    public Sale update(@PathVariable Long id, @RequestBody Sale sale) {
        return saleService.update(id, sale);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        saleService.delete(id);
    }
}
